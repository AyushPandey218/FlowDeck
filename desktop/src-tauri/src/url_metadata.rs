use regex::Regex;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use reqwest::Client;

#[derive(Serialize, Deserialize, Debug)]
pub struct UrlMetadata {
    pub title: Option<String>,
    pub domain: String,
    pub favicon: Option<String>, // Base64 string
}

fn get_domain_from_url(url_str: &str) -> String {
    if let Ok(parsed) = url::Url::parse(url_str) {
        parsed.host_str().unwrap_or("").to_string()
    } else {
        url_str.to_string()
    }
}

fn extract_title(html: &str) -> Option<String> {
    let re = Regex::new(r"(?i)<title[^>]*>([^<]+)</title>").ok()?;
    if let Some(caps) = re.captures(html) {
        Some(caps.get(1)?.as_str().trim().to_string())
    } else {
        None
    }
}

fn extract_favicon_url(html: &str, base_url: &str) -> Option<String> {
    let re = Regex::new(r#"(?i)<link[^>]*rel=["'](?:shortcut )?icon(?: |"|')[^>]*href=["']([^"']+)["']"#).ok()?;
    if let Some(caps) = re.captures(html) {
        let href = caps.get(1)?.as_str();
        if href.starts_with("http://") || href.starts_with("https://") {
            return Some(href.to_string());
        } else if href.starts_with("//") {
            return Some(format!("https:{}", href));
        } else if href.starts_with('/') {
            if let Ok(parsed_base) = url::Url::parse(base_url) {
                let origin = format!("{}://{}", parsed_base.scheme(), parsed_base.host_str().unwrap_or(""));
                return Some(format!("{}{}", origin, href));
            }
        } else {
            return Some(format!("{}/{}", base_url.trim_end_matches('/'), href));
        }
    }
    None
}

async fn download_image_as_base64(client: &Client, url: &str) -> Option<String> {
    if let Ok(response) = client.get(url).send().await {
        if response.status().is_success() {
            let content_type = response
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .unwrap_or("image/png")
                .to_string();
            
            // Do not encode HTML pages (e.g. 404s returning 200 OK)
            if content_type.contains("text/html") || content_type.contains("text/plain") {
                return None;
            }
            
            if let Ok(bytes) = response.bytes().await {
                use base64::{Engine as _, engine::general_purpose::STANDARD};
                let b64 = STANDARD.encode(&bytes);
                return Some(format!("data:{};base64,{}", content_type, b64));
            }
        }
    }
    None
}

#[tauri::command]
pub async fn fetch_url_metadata(url: String) -> Result<UrlMetadata, String> {
    let domain = get_domain_from_url(&url);
    if domain.is_empty() {
        return Err("Invalid URL domain".to_string());
    }

    let client = Client::builder()
        .timeout(Duration::from_secs(5))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let mut title = None;
    let mut favicon_base64 = None;

    // Fetch HTML
    if let Ok(response) = client.get(&url).send().await {
        if let Ok(html) = response.text().await {
            title = extract_title(&html);
            
            // 1. Try to extract from HTML
            if let Some(fav_url) = extract_favicon_url(&html, &url) {
                favicon_base64 = download_image_as_base64(&client, &fav_url).await;
            }
        }
    }

    // 2. Fallback to /favicon.ico
    if favicon_base64.is_none() {
        if let Ok(parsed) = url::Url::parse(&url) {
            let origin = format!("{}://{}/favicon.ico", parsed.scheme(), parsed.host_str().unwrap_or(""));
            favicon_base64 = download_image_as_base64(&client, &origin).await;
        }
    }

    // 3. Fallback to Google Favicon service
    if favicon_base64.is_none() {
        let google_url = format!("https://www.google.com/s2/favicons?domain={}&sz=128", domain);
        favicon_base64 = download_image_as_base64(&client, &google_url).await;
    }

    println!("[URL_METADATA] Fetched metadata for {}: title={:?}, favicon is_some={}", url, title, favicon_base64.is_some());

    Ok(UrlMetadata {
        title,
        domain,
        favicon: favicon_base64,
    })
}

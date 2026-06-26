const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Watch all files in the monorepo (so the shared package is watched)
config.watchFolders = [workspaceRoot];

// Force Metro to look inside mobile/node_modules first, then workspace root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Block list desktop project packages and build folders to avoid resolving duplicate React copies
config.resolver.blockList = [
  /.*[/\\]desktop[/\\]node_modules[/\\]?.*/i,
  /.*[/\\]desktop[/\\]src-tauri[/\\]?.*/i,
  /.*[/\\]desktop[/\\]dist[/\\]?.*/i,
];

// Redirect core modules to the mobile folder to prevent duplicate instances
config.resolver.extraNodeModules = new Proxy({}, {
  get: (target, name) => {
    if (typeof name !== 'string') return undefined;
    const localModules = [
      'react',
      'react-dom',
      'react-native',
      '@react-navigation/native',
      '@react-navigation/bottom-tabs',
      '@react-navigation/native-stack',
      'react-native-safe-area-context',
      'react-native-screens',
      'zustand',
      'lucide-react-native'
    ];
    if (localModules.includes(name) || name.startsWith('@react-navigation/')) {
      return path.resolve(projectRoot, 'node_modules', name);
    }
    return undefined;
  }
});

module.exports = withNativeWind(config, { input: './global.css' });

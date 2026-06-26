import { AuthRequestSchema } from './validators';
console.log('=== Running Zod Verification Test ===');
const validPayload = {
    deviceId: '12345678-abcd-ef01-2345-6789abcdef01', // Valid UUID
    deviceName: 'Pixel 7 Pro', // Valid Name
    pairingToken: 'temp_pairing_token_123456', // Valid Token (>8 chars)
};
const invalidPayload = {
    deviceId: 'invalid-uuid-format',
    deviceName: '', // Too short
    pairingToken: 'short', // Too short (<8 chars)
};
console.log('\n[TEST 1] Testing with VALID payload:');
const validResult = AuthRequestSchema.safeParse(validPayload);
console.log('Success:', validResult.success);
if (validResult.success) {
    console.log('Parsed Data:', JSON.stringify(validResult.data, null, 2));
}
else {
    console.error('Validation Errors:', validResult.error.format());
}
console.log('\n[TEST 2] Testing with INVALID payload:');
const invalidResult = AuthRequestSchema.safeParse(invalidPayload);
console.log('Success:', invalidResult.success);
if (invalidResult.success) {
    console.log('Parsed Data:', JSON.stringify(invalidResult.data, null, 2));
}
else {
    console.log('Validation Errors (Formatted):', JSON.stringify(invalidResult.error.format(), null, 2));
}

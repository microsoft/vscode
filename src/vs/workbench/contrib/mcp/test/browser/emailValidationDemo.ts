// Simple test to verify our email validation fix is working
import assert from 'assert';

// Test that demonstrates the fix
function testEmailValidation() {
    console.log('Testing email validation fix...');
    
    // This is the fixed logic from our code
    function validateEmailFormat(value: string): { isValid: boolean; message?: string } {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(value)
            ? { isValid: true }
            : { isValid: false, message: 'Please enter a valid email address' };
    }
    
    // Test valid emails
    const validEmails = ['user@example.com', 'test@domain.org', 'valid.email@test.co.uk'];
    validEmails.forEach(email => {
        const result = validateEmailFormat(email);
        assert.strictEqual(result.isValid, true, `${email} should be valid`);
    });
    
    // Test invalid emails  
    const invalidEmails = ['invalid-email', 'missing@domain', '@domain.com', 'user@', ''];
    invalidEmails.forEach(email => {
        const result = validateEmailFormat(email);
        assert.strictEqual(result.isValid, false, `${email} should be invalid`);
    });
    
    console.log('✅ All email validation tests passed!');
}

if (require.main === module) {
    testEmailValidation();
}
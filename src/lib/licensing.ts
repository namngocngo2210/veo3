import { getLicenseData, saveLicenseData } from './store';

export interface LicenseData {
    key: string;
    status: 'active' | 'expired' | 'invalid';
    expiryDate: string | null;
    userEmail: string | null;
    lastChecked: number;
}

export async function validateLicenseKey(key: string): Promise<LicenseData> {
    // MOCK VALIDATION LOGIC
    // In a real app, this would call your backend API: POST /api/verify { key }

    // Simulation: Keys starting with "TEST_" are valid for 30 days
    if (key.trim().toUpperCase().startsWith('TEST_')) {
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 30); // Valid for 30 days from now

        return {
            key: key.trim(),
            status: 'active',
            expiryDate: expiry.toISOString(),
            userEmail: 'demo_tester@veox.com',
            lastChecked: Date.now()
        };
    }

    // Simulation: Keys starting with "EXP_" are expired
    if (key.trim().toUpperCase().startsWith('EXP_')) {
        const expiry = new Date();
        expiry.setDate(expiry.getDate() - 1); // Expired yesterday

        return {
            key: key.trim(),
            status: 'expired',
            expiryDate: expiry.toISOString(),
            userEmail: 'expired_user@veox.com',
            lastChecked: Date.now()
        };
    }

    // Default: Invalid
    return {
        key: key.trim(),
        status: 'invalid',
        expiryDate: null,
        userEmail: null,
        lastChecked: Date.now()
    };
}

export async function checkAndRefreshLicense(): Promise<boolean> {
    try {
        const currentData = await getLicenseData();
        if (currentData && currentData.key) {
            console.log('Auto-checking license for key:', currentData.key);
            const newData = await validateLicenseKey(currentData.key);
            console.log('License refresh result:', newData.status);
            await saveLicenseData(newData);
            return newData.status === 'active';
        } else {
            console.log('No license key found to auto-check.');
            return false;
        }
    } catch (e) {
        console.error('Failed to auto-check license:', e);
        return false;
    }
}

import { getLicenseData, saveLicenseData, getDeviceId } from './store';

// Change this to your actual API base URL
const LICENSING_API_BASE = 'http://152.42.254.200:8000';

export interface LicenseData {
    key: string;
    status: 'active' | 'expired' | 'invalid';
    expiryDate: string | null;
    userEmail: string | null;
    lastChecked: number;
}

export async function validateLicenseKey(key: string): Promise<LicenseData> {
    try {
        const deviceId = await getDeviceId();
        const response = await fetch(`${LICENSING_API_BASE}/api/activate/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, device_id: deviceId })
        });

        const result = await response.json();

        if (response.ok && result.valid) {
            return {
                key: key.trim(),
                status: 'active',
                expiryDate: null, // API doesn't return expiry yet, keeping as null or handle if needed
                userEmail: null,
                lastChecked: Date.now()
            };
        }

        return {
            key: key.trim(),
            status: result.error?.includes('expired') ? 'expired' : 'invalid',
            expiryDate: null,
            userEmail: null,
            lastChecked: Date.now()
        };
    } catch (e) {
        console.error('License activation error:', e);
        return {
            key: key.trim(),
            status: 'invalid',
            expiryDate: null,
            userEmail: null,
            lastChecked: Date.now()
        };
    }
}

export async function checkAndRefreshLicense(): Promise<boolean> {
    try {
        const deviceId = await getDeviceId();
        const response = await fetch(`${LICENSING_API_BASE}/api/check/?device_id=${encodeURIComponent(deviceId)}`);

        if (response.status === 404) {
            // Handle Not Found (Invalid) 
            const currentData = await getLicenseData();
            if (currentData) {
                await saveLicenseData({ ...currentData, status: 'invalid', lastChecked: Date.now() });
            }
            return false;
        }

        const result = await response.json();

        if (response.ok && result.valid) {
            const currentData = await getLicenseData();
            const newData: LicenseData = {
                key: result.license || currentData?.key || '',
                status: 'active',
                expiryDate: null,
                userEmail: null,
                lastChecked: Date.now()
            };
            await saveLicenseData(newData);
            return true;
        }

        return false;
    } catch (e) {
        console.error('Failed to auto-check license:', e);
        // Fallback to cached status if network fails? 
        // For now, let's keep previous status to avoid locking users out on random network glitches
        const currentData = await getLicenseData();
        return currentData?.status === 'active';
    }
}

import { useState, useEffect } from 'react';
import { getApiKey, saveApiKey, getLicenseData, saveLicenseData, saveModel, saveLanguage } from '../lib/store';
import { validateLicenseKey, LicenseData } from '../lib/licensing';
import { Save, CheckCircle2, Eye, EyeOff, Globe, ShieldCheck, ShieldAlert, Calendar, User } from 'lucide-react';
import { translations, Language } from '../lib/i18n';
import { useToast } from './Toast';

interface ConfigTabProps {
    model: string;
    onModelChange: (model: string) => void;
    language: string;
    onLanguageChange: (lang: string) => void;
    onLicenseUpdate?: (isValid: boolean) => void;
}

export function ConfigTab({ model, onModelChange, language, onLanguageChange, onLicenseUpdate }: ConfigTabProps) {
    const [apiKey, setApiKey] = useState('');
    const [licenseKey, setLicenseKey] = useState('');
    const [licenseData, setLicenseData] = useState<LicenseData | null>(null);
    const [isSaved, setIsSaved] = useState(false);
    const [isCheckingLicense, setIsCheckingLicense] = useState(false);
    const [showKey, setShowKey] = useState(false);
    const [showLicenseKey, setShowLicenseKey] = useState(false);

    const t = translations[language as Language] || translations.vi;
    const { success: toastSuccess } = useToast();

    useEffect(() => {
        getApiKey().then((key) => {
            if (key) setApiKey(key);
        });
        getLicenseData().then((data) => {
            if (data) {
                setLicenseData(data);
                setLicenseKey(data.key);
            }
        });
    }, []);

    const handleSave = async () => {
        await saveApiKey(apiKey);
        setIsSaved(true);
        toastSuccess(t.saved || 'Saved');
        setTimeout(() => setIsSaved(false), 2000);
    };

    const handleSaveLicense = async () => {
        setIsCheckingLicense(true);
        try {
            const result = await validateLicenseKey(licenseKey);
            await saveLicenseData(result);
            setLicenseData(result);

            if (result.status === 'active') {
                toastSuccess(t.saved || 'License Active');
                if (onLicenseUpdate) onLicenseUpdate(true);
            } else {
                toastSuccess(t.statusInvalid || 'License Invalid');
                if (onLicenseUpdate) onLicenseUpdate(false);
            }
        } finally {
            setIsCheckingLicense(false);
        }
    };

    const getStatusColor = (status?: string) => {
        if (status === 'active') return 'text-green-600 bg-green-50 border-green-200';
        if (status === 'expired') return 'text-orange-600 bg-orange-50 border-orange-200';
        return 'text-red-600 bg-red-50 border-red-200';
    };

    const getStatusIcon = (status?: string) => {
        if (status === 'active') return <ShieldCheck className="w-5 h-5" />;
        return <ShieldAlert className="w-5 h-5" />;
    };

    return (
        <div className="max-w-xl space-y-8">
            {/* API Key */}
            <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">{t.apiKeyLabel}</label>
                <div className="flex gap-2">
                    <div className="flex-1 relative">
                        <input
                            type={showKey ? 'text' : 'password'}
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder={t.apiKeyPlaceholder}
                            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 pr-10 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition text-sm"
                        />
                        <button
                            onClick={() => setShowKey(!showKey)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={!apiKey.trim()}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${isSaved
                            ? 'bg-green-100 text-green-700'
                            : 'bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white'
                            }`}
                    >
                        {isSaved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                        {isSaved ? t.saved : t.save}
                    </button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                    {t.apiKeyHelp}{' '}
                    <a href="https://aistudio.google.com/apikey" target="_blank" className="underline text-blue-500 hover:text-blue-600">
                        {t.getKeyLink}
                    </a>
                </p>
            </div>

            {/* License Management */}
            <div>
                <h3 className="text-sm font-medium mb-3 text-gray-700 flex items-center gap-2">
                    {t.activeKeyLabel}
                    {licenseData && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${getStatusColor(licenseData.status)}`}>
                            {licenseData.status === 'active' ? t.statusActive :
                                licenseData.status === 'expired' ? t.statusExpired : t.statusInvalid}
                        </span>
                    )}
                </h3>

                {/* Status Card */}
                {licenseData && licenseData.status !== 'invalid' && (
                    <div className={`mb-4 p-4 rounded-lg border ${getStatusColor(licenseData.status)} bg-opacity-50 flex flex-col gap-2`}>
                        <div className="flex items-center gap-2 font-medium">
                            {getStatusIcon(licenseData.status)}
                            <span>{licenseData.status === 'active' ? t.statusActive : t.statusExpired}</span>
                        </div>
                        {licenseData.expiryDate && (
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2 text-xs opacity-90">
                                    <Calendar className="w-3.5 h-3.5" />
                                    {t.expiryDate}: {new Date(licenseData.expiryDate).toLocaleDateString()}
                                </div>
                                {licenseData.status === 'active' && (
                                    <div className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-1 rounded w-fit">
                                        {t.daysRemaining}: {Math.max(0, Math.ceil((new Date(licenseData.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))}
                                    </div>
                                )}
                                {licenseData.status === 'expired' && (
                                    <div className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded w-fit uppercase">
                                        {t.licenseExpired}
                                    </div>
                                )}
                            </div>
                        )}
                        {licenseData.userEmail && (
                            <div className="flex items-center gap-2 text-xs opacity-90">
                                <User className="w-3.5 h-3.5" />
                                {t.licenseUser}: {licenseData.userEmail}
                            </div>
                        )}
                    </div>
                )}

                <div className="flex gap-2">
                    <div className="flex-1 relative">
                        <input
                            type={showLicenseKey ? 'text' : 'password'}
                            value={licenseKey}
                            onChange={(e) => setLicenseKey(e.target.value)}
                            placeholder={t.activeKeyPlaceholder}
                            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 pr-10 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition text-sm"
                        />
                        <button
                            onClick={() => setShowLicenseKey(!showLicenseKey)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            {showLicenseKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                    <button
                        onClick={handleSaveLicense}
                        disabled={!licenseKey.trim() || isCheckingLicense}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium transition"
                    >
                        {isCheckingLicense ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                {t.checking}
                            </>
                        ) : (
                            <>
                                <CheckCircle2 className="w-4 h-4" />
                                {t.save}
                            </>
                        )}
                    </button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                    {t.activeKeyHelp}
                </p>
            </div>

            {/* Model */}
            <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">{t.modelLabel}</label>
                <select
                    value={model}
                    onChange={(e) => { onModelChange(e.target.value); saveModel(e.target.value); }}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition text-sm text-gray-900"
                >
                    <option value="veo-3.1-generate-preview">Veo 3.1 Preview</option>
                    <option value="veo-3.1-fast-generate-preview">Veo 3.1 Fast Preview</option>
                </select>
            </div>

            {/* Language */}
            <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">
                    <Globe className="w-4 h-4 inline mr-1.5" />{t.langLabel}
                </label>
                <select
                    value={language}
                    onChange={(e) => { onLanguageChange(e.target.value); saveLanguage(e.target.value); }}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition text-sm text-gray-900"
                >
                    <option value="vi">Tiếng Việt</option>
                    <option value="en">English</option>
                </select>
            </div>
        </div>
    );
}

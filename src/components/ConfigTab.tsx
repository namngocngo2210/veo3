import { useState, useEffect } from 'react';
import { getApiKey, saveApiKey, saveModel, saveLanguage } from '../lib/store';
import { Save, CheckCircle2, Eye, EyeOff, Globe } from 'lucide-react';
import { translations, Language } from '../lib/i18n';

interface ConfigTabProps {
    model: string;
    onModelChange: (model: string) => void;
    language: string;
    onLanguageChange: (lang: string) => void;
}

export function ConfigTab({ model, onModelChange, language, onLanguageChange }: ConfigTabProps) {
    const [apiKey, setApiKey] = useState('');
    const [isSaved, setIsSaved] = useState(false);
    const [showKey, setShowKey] = useState(false);

    const t = translations[language as Language] || translations.vi;

    useEffect(() => {
        getApiKey().then((key) => {
            if (key) setApiKey(key);
        });
    }, []);

    const handleSave = async () => {
        await saveApiKey(apiKey);
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 2000);
    };

    return (
        <div className="max-w-xl space-y-6">
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

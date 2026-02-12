import { useState, useEffect, useRef } from "react";
import { ConfigTab } from "./components/ConfigTab";
import { TextToVideoTab, TextToVideoTabHandle } from "./components/TextToVideoTab";
import { ImageToVideoTab } from "./components/ImageToVideoTab";
import { BananaTab } from "./components/BananaTab";
import { VisualPromptsTab } from "./components/VisualPromptsTab";
import { LogsTab } from "./components/LogsTab";
import { Settings, Type, ImageIcon, Image as BananaIcon, FileText, Terminal, Lock } from "lucide-react";
import { useLogger } from "./components/LogContext";
import { getLanguage } from "./lib/store";
import { translations, Language } from "./lib/i18n";
import { checkAndRefreshLicense } from "./lib/licensing";

type Tab = 'text' | 'image' | 'banana' | 'visual' | 'config' | 'logs';

const tabs: { id: Tab; icon: React.ReactNode }[] = [
  { id: 'text', icon: <Type className="w-3.5 h-3.5" /> },
  { id: 'image', icon: <ImageIcon className="w-3.5 h-3.5" /> },
  { id: 'banana', icon: <BananaIcon className="w-3.5 h-3.5" /> },
  { id: 'visual', icon: <FileText className="w-3.5 h-3.5" /> },
  { id: 'config', icon: <Settings className="w-3.5 h-3.5" /> },
  { id: 'logs', icon: <Terminal className="w-3.5 h-3.5" /> },
];

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('text');
  const [model, setModel] = useState('veo-3.1-generate-preview');
  const [language, setLanguage] = useState('vi');
  const [isLicensed, setIsLicensed] = useState<boolean>(false); // Default locked

  const textTabRef = useRef<TextToVideoTabHandle>(null);
  const bananaTabRef = useRef<any>(null);
  const { addLog } = useLogger();

  useEffect(() => {
    getLanguage().then(setLanguage);

    // Startup check
    checkAndRefreshLicense().then(isValid => {
      setIsLicensed(isValid);
      if (!isValid) setActiveTab('config');
    });

    // Periodic check (every 1 hour)
    const interval = setInterval(() => {
      checkAndRefreshLicense().then(isValid => {
        setIsLicensed(isValid);
        if (!isValid) setActiveTab('config');
      });
    }, 60 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const t = translations[language as Language] || translations.vi;

  const getTabLabel = (id: Tab) => {
    switch (id) {
      case 'text': return t.tabText;
      case 'image': return t.tabImage;
      case 'banana': return t.tabBanana;
      case 'visual': return t.tabVisualPrompts;
      case 'config': return t.tabConfig;
      case 'logs': return t.tabLogs;
    }
  };

  return (
    <main className="h-screen flex flex-col bg-[#f5f5f5] text-gray-900 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-200 bg-white shrink-0">
        <h1 className="text-sm font-semibold tracking-tight">{t.appTitle}</h1>
        <nav className="flex gap-0.5 p-0.5 rounded-lg bg-gray-100">
          {tabs.map((tab) => {
            const isLocked = !isLicensed && tab.id !== 'config';
            return (
              <button
                key={tab.id}
                onClick={() => !isLocked && setActiveTab(tab.id)}
                disabled={isLocked}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${activeTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                  } ${isLocked ? "opacity-50 cursor-not-allowed grayscale" : ""}`}
                title={getTabLabel(tab.id)}
              >
                {isLocked ? <Lock className="w-3.5 h-3.5 text-gray-400" /> : tab.icon}
                {getTabLabel(tab.id)}
              </button>
            );
          })}
        </nav>
      </div>
      <div className="flex-1 overflow-auto p-5">
        <div className={activeTab === 'text' ? 'h-full' : 'hidden'}>
          <TextToVideoTab ref={textTabRef} model={model} language={language} />
        </div>
        <div className={activeTab === 'image' ? 'h-full' : 'hidden'}>
          <ImageToVideoTab model={model} language={language} />
        </div>
        <div className={activeTab === 'banana' ? 'h-full' : 'hidden'}>
          <BananaTab ref={bananaTabRef} model={model} language={language} />
        </div>
        <div className={activeTab === 'visual' ? 'h-full' : 'hidden'}>
          <VisualPromptsTab
            model={model}
            language={language}
            onAddPrompts={(prompts) => {
              setActiveTab('text');
              setTimeout(() => textTabRef.current?.addPrompts(prompts), 100);
            }}
            onAddBananaPrompts={(prompts) => {
              addLog('info', 'App', `Sending ${prompts.length} prompts to Nano Banana`);
              setActiveTab('banana');
              setTimeout(() => {
                if (bananaTabRef.current) {
                  bananaTabRef.current.addPrompts(prompts);
                  addLog('debug', 'App', 'Prompts added to BananaTab');
                } else {
                  addLog('error', 'App', 'BananaTab ref not found');
                }
              }, 200);
            }}
          />
        </div>
        <div className={activeTab === 'logs' ? 'h-full' : 'hidden'}>
          <LogsTab />
        </div>
        <div className={activeTab === 'config' ? '' : 'hidden'}>
          {activeTab === 'config' && (
            <ConfigTab
              model={model}
              onModelChange={setModel}
              language={language}
              onLanguageChange={setLanguage}
              onLicenseUpdate={(isValid) => {
                setIsLicensed(isValid);
                if (isValid) window.location.reload(); // Optional: reload to refresh state completely or just unlock
              }}
            />
          )}
        </div>
      </div>
    </main>
  );
}

export default App;

import { ReactNode, createContext, useContext, useMemo, useState } from "react";

export type AppLanguage = "en" | "mr" | "hi";

type LanguageState = {
  language: AppLanguage;
  setLanguage: (value: AppLanguage) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

const LANGUAGE_KEY = "nagarseva_language";

const dictionary: Record<string, Record<AppLanguage, string>> = {
  langLabel: { en: "Language", mr: "भाषा", hi: "भाषा" },
  english: { en: "English", mr: "इंग्रजी", hi: "अंग्रेज़ी" },
  marathi: { en: "Marathi", mr: "मराठी", hi: "मराठी" },
  hindi: { en: "Hindi", mr: "हिंदी", hi: "हिंदी" },
  fileComplaint: { en: "File Complaint", mr: "तक्रार नोंदवा", hi: "शिकायत दर्ज करें" },
  track: { en: "Track", mr: "ट्रॅक", hi: "ट्रैक" },
  cityMap: { en: "City Map", mr: "शहर नकाशा", hi: "शहर मानचित्र" },
  myDashboard: { en: "My Dashboard", mr: "माझे डॅशबोर्ड", hi: "मेरा डैशबोर्ड" },
  logout: { en: "Logout", mr: "लॉगआउट", hi: "लॉगआउट" },
  signIn: { en: "Sign In", mr: "साइन इन", hi: "साइन इन" },
  myComplaints: { en: "My Complaints", mr: "माझ्या तक्रारी", hi: "मेरी शिकायतें" },
  trackMyIssues: { en: "Track all your reported issues", mr: "तुमच्या सर्व नोंदवलेल्या तक्रारी ट्रॅक करा", hi: "अपनी सभी दर्ज शिकायतों को ट्रैक करें" },
  newComplaint: { en: "New Complaint", mr: "नवीन तक्रार", hi: "नई शिकायत" },
  totalFiled: { en: "Total Filed", mr: "एकूण नोंदवलेल्या", hi: "कुल दर्ज" },
  open: { en: "Open", mr: "प्रलंबित", hi: "खुली" },
  closed: { en: "Closed", mr: "बंद", hi: "बंद" },
  inProgress: { en: "In Progress", mr: "प्रक्रियेत", hi: "प्रगति पर" },
  allStatuses: { en: "All Statuses", mr: "सर्व स्थिती", hi: "सभी स्थिति" },
  allCategories: { en: "All Categories", mr: "सर्व विभाग", hi: "सभी श्रेणियाँ" },
  noComplaintsFound: { en: "No complaints found", mr: "तक्रारी आढळल्या नाहीत", hi: "कोई शिकायत नहीं मिली" },
  noComplaintsYet: { en: "You haven't filed any complaints yet.", mr: "तुम्ही अजून तक्रार नोंदवलेली नाही.", hi: "आपने अभी तक कोई शिकायत दर्ज नहीं की है।" },
  fileFirstComplaint: { en: "File Your First Complaint", mr: "पहिली तक्रार नोंदवा", hi: "अपनी पहली शिकायत दर्ज करें" },
  submitted: { en: "Submitted", mr: "सबमिट", hi: "जमा" },
  accepted: { en: "Accepted", mr: "स्वीकारले", hi: "स्वीकृत" },
  complaintTracking: { en: "Complaint Tracking", mr: "तक्रार ट्रॅकिंग", hi: "शिकायत ट्रैकिंग" },
  trackComplaintById: { en: "Track Complaint by ID", mr: "आयडीद्वारे तक्रार ट्रॅक करा", hi: "आईडी से शिकायत ट्रैक करें" },
  trackHelp: { en: "Enter your complaint ID and view current progress: Submitted, Accepted, In Progress, or Closed.", mr: "तुमचा तक्रार आयडी टाका आणि प्रगती पहा: सबमिट, स्वीकारले, प्रक्रियेत किंवा बंद.", hi: "अपना शिकायत आईडी दर्ज करें और प्रगति देखें: जमा, स्वीकृत, प्रगति पर या बंद।" },
  enterComplaintId: { en: "Enter complaint ID (e.g., CMP-ABC123-123)", mr: "तक्रार आयडी टाका (उदा., CMP-ABC123-123)", hi: "शिकायत आईडी दर्ज करें (जैसे, CMP-ABC123-123)" },
  pleaseSignInFirst: { en: "Please sign in first.", mr: "कृपया आधी साइन इन करा.", hi: "कृपया पहले साइन इन करें।" },
  pleaseEnterComplaintId: { en: "Please enter complaint ID.", mr: "कृपया तक्रार आयडी टाका.", hi: "कृपया शिकायत आईडी दर्ज करें।" },
  unableToTrack: { en: "Unable to track complaint", mr: "तक्रार ट्रॅक करता आली नाही", hi: "शिकायत ट्रैक नहीं हो सकी" },
  complaintId: { en: "Complaint ID", mr: "तक्रार आयडी", hi: "शिकायत आईडी" },
  reportIssue: { en: "Report an Issue", mr: "समस्या नोंदवा", hi: "समस्या दर्ज करें" },
  reportIssueHelp: { en: "Describe the civic problem and we'll try to solve it.", mr: "नागरी समस्या वर्णन करा, आम्ही सोडवण्याचा प्रयत्न करू.", hi: "नागरिक समस्या बताएं, हम उसे हल करने की कोशिश करेंगे।" },
  details: { en: "Details", mr: "तपशील", hi: "विवरण" },
  describe: { en: "Describe", mr: "वर्णन", hi: "वर्णन" },
  photos: { en: "Photos", mr: "फोटो", hi: "फोटो" },
  location: { en: "Location", mr: "स्थान", hi: "स्थान" },
  nameLabel: { en: "Enter your name", mr: "तुमचे नाव टाका", hi: "अपना नाम दर्ज करें" },
  namePlaceholder: { en: "Enter your full name", mr: "तुमचे पूर्ण नाव टाका", hi: "अपना पूरा नाम दर्ज करें" },
  emailLabel: { en: "Email", mr: "ईमेल", hi: "ईमेल" },
  emailPlaceholder: { en: "Enter your email", mr: "तुमचा ईमेल टाका", hi: "अपना ईमेल दर्ज करें" },
  mobileLabel: { en: "Mobile Number", mr: "मोबाइल नंबर", hi: "मोबाइल नंबर" },
  mobilePlaceholder: { en: "Enter mobile number", mr: "मोबाइल नंबर टाका", hi: "मोबाइल नंबर दर्ज करें" },
  describeIssue: { en: "Describe the issue", mr: "समस्येचे वर्णन करा", hi: "समस्या का वर्णन करें" },
  describePlaceholder: { en: "Type or use the mic to speak your description...", mr: "टाइप करा किंवा माइक वापरा...", hi: "टाइप करें या माइक का उपयोग करें..." },
  listening: { en: "Listening...", mr: "ऐकत आहे...", hi: "सुन रहा है..." },
  useVoice: { en: "Use voice", mr: "आवाज वापरा", hi: "आवाज़ उपयोग करें" },
  voiceHelp: { en: "Type or tap the mic to speak. You can edit the text after.", mr: "टाइप करा किंवा माइक वापरा. नंतर मजकूर संपादित करू शकता.", hi: "टाइप करें या माइक दबाएँ। बाद में टेक्स्ट संपादित कर सकते हैं।" },
  uploadPhotos: { en: "Upload Photos (Optional)", mr: "फोटो अपलोड करा (ऐच्छिक)", hi: "फोटो अपलोड करें (वैकल्पिक)" },
  photosHelp: { en: "You can select multiple photos or use camera.", mr: "तुम्ही अनेक फोटो निवडू शकता किंवा कॅमेरा वापरू शकता.", hi: "आप कई फोटो चुन सकते हैं या कैमरा उपयोग कर सकते हैं।" },
  whereIsIt: { en: "Where is it?", mr: "हे कुठे आहे?", hi: "यह कहाँ है?" },
  addressPlaceholder: { en: "Type address or use GPS to detect", mr: "पत्ता टाका किंवा GPS वापरा", hi: "पता लिखें या GPS उपयोग करें" },
  gpsCaptured: { en: "Location captured. Edit below if needed.", mr: "स्थान मिळाले. हवे असल्यास संपादित करा.", hi: "लोकेशन मिल गई। जरूरत हो तो संपादित करें।" },
  locationHelp: { en: "Type your address or use GPS. You can edit the result if needed.", mr: "पत्ता टाका किंवा GPS वापरा. हवे असल्यास बदल करा.", hi: "पता लिखें या GPS उपयोग करें। जरूरत हो तो बदलें।" },
  complaintAccepted: { en: "Complaint Accepted", mr: "तक्रार स्वीकारली", hi: "शिकायत स्वीकार की गई" },
  complaintIdPrefix: { en: "Complaint ID", mr: "तक्रार आयडी", hi: "शिकायत आईडी" },
  submitting: { en: "Submitting...", mr: "सबमिट होत आहे...", hi: "सबमिट हो रहा है..." },
  submitReport: { en: "Submit Report", mr: "तक्रार सबमिट करा", hi: "रिपोर्ट सबमिट करें" },
  cancel: { en: "Cancel", mr: "रद्द करा", hi: "रद्द करें" },
  markers: { en: "Markers", mr: "मार्कर्स", hi: "मार्कर" },
  statusLegend: { en: "Status Legend", mr: "स्थिती मार्गदर्शक", hi: "स्थिति संकेत" },
  complaintsCount: { en: "{count} complaints", mr: "{count} तक्रारी", hi: "{count} शिकायतें" }
};

const LanguageContext = createContext<LanguageState | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(() => {
    const stored = localStorage.getItem(LANGUAGE_KEY) as AppLanguage | null;
    return stored === "en" || stored === "mr" || stored === "hi" ? stored : "en";
  });

  const value = useMemo<LanguageState>(
    () => ({
      language,
      setLanguage(next) {
        localStorage.setItem(LANGUAGE_KEY, next);
        setLanguageState(next);
      },
      t(key, params) {
        const template = dictionary[key]?.[language] ?? key;
        if (!params) return template;
        return Object.entries(params).reduce((acc, [paramKey, paramValue]) => {
          return acc.replace(new RegExp(`\\{${paramKey}\\}`, "g"), String(paramValue));
        }, template);
      }
    }),
    [language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used under LanguageProvider");
  return context;
}

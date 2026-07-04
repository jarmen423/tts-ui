/**
 * Shared Magpie TTS catalog — imported by server + React so voices always render
 * even if /api/tts/nvidia/voices is unreachable during dev/HMR.
 */

export const NVIDIA_MAGPIE_TTS_MODEL = 'nvidia/magpie-tts-multilingual';
export const NVIDIA_ZEROSHOT_TTS_MODEL = 'nvidia/magpie-tts-zeroshot';

export type NvidiaMagpieVoice = {
  id: string;
  name: string;
  locale: string;
  style?: string;
  family?: 'multilingual' | 'zeroshot';
};

export const NVIDIA_MAGPIE_VOICES: NvidiaMagpieVoice[] = [
  { id: 'Magpie-Multilingual.EN-US.Aria', name: 'Aria', locale: 'en-US', family: 'multilingual' },
  { id: 'Magpie-Multilingual.EN-US.Jason', name: 'Jason', locale: 'en-US', family: 'multilingual' },
  { id: 'Magpie-Multilingual.EN-US.Aria.Happy', name: 'Aria (Happy)', locale: 'en-US', style: 'Happy', family: 'multilingual' },
  { id: 'Magpie-Multilingual.EN-US.Aria.Calm', name: 'Aria (Calm)', locale: 'en-US', style: 'Calm', family: 'multilingual' },
  { id: 'Magpie-Multilingual.EN-US.Jason.Happy', name: 'Jason (Happy)', locale: 'en-US', style: 'Happy', family: 'multilingual' },
  { id: 'Magpie-Multilingual.ES-US.Sofia', name: 'Sofia', locale: 'es-US', family: 'multilingual' },
  { id: 'Magpie-Multilingual.FR-FR.Pascal', name: 'Pascal', locale: 'fr-FR', family: 'multilingual' },
  { id: 'Magpie-Multilingual.DE-DE.Leo', name: 'Leo', locale: 'de-DE', family: 'multilingual' },
  { id: 'Magpie-Multilingual.IT-IT.Giulia', name: 'Giulia', locale: 'it-IT', family: 'multilingual' },
  { id: 'Magpie-Multilingual.JA-JP.Yuki', name: 'Yuki', locale: 'ja-JP', family: 'multilingual' },
];

/** Built-in zeroshot voices (no reference clip) — Magpie TTS Zeroshot NIM */
export const NVIDIA_ZEROSHOT_VOICES: NvidiaMagpieVoice[] = [
  { id: 'Magpie-ZeroShot.Female-1', name: 'Female 1', locale: 'en-US', family: 'zeroshot' },
  { id: 'Magpie-ZeroShot.Female-Neutral', name: 'Female Neutral', locale: 'en-US', family: 'zeroshot' },
  { id: 'Magpie-ZeroShot.Female-Happy', name: 'Female Happy', locale: 'en-US', family: 'zeroshot' },
  { id: 'Magpie-ZeroShot.Female-Calm', name: 'Female Calm', locale: 'en-US', family: 'zeroshot' },
  { id: 'Magpie-ZeroShot.Male-1', name: 'Male 1', locale: 'en-US', family: 'zeroshot' },
  { id: 'Magpie-ZeroShot.Male-Neutral', name: 'Male Neutral', locale: 'en-US', family: 'zeroshot' },
  { id: 'Magpie-ZeroShot.Male-Calm', name: 'Male Calm', locale: 'en-US', family: 'zeroshot' },
];
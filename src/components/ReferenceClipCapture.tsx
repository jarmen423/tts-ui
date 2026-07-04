import React, { useRef, useState } from 'react';
import { Upload, AudioLines, Mic, Square } from 'lucide-react';

export type ReferenceClipVariant = 'orange' | 'teal';

type Props = {
  variant: ReferenceClipVariant;
  hint: string;
  audioBase64: string;
  audioName: string;
  onSet: (base64: string, name: string, mime?: string) => void;
  onClear: () => void;
};

const variantStyles: Record<
  ReferenceClipVariant,
  { border: string; hover: string; text: string; icon: string; bg: string }
> = {
  orange: {
    border: 'border-orange-500/40 hover:border-orange-400/60',
    hover: '',
    text: 'text-orange-200',
    icon: 'text-orange-400',
    bg: 'border-orange-500/30',
  },
  teal: {
    border: 'border-teal-500/40 hover:border-teal-400/60',
    hover: '',
    text: 'text-teal-200',
    icon: 'text-teal-400',
    bg: 'border-teal-500/30',
  },
};

function fileToBase64(file: File): Promise<{ base64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve({ base64, mime: file.type || 'audio/wav' });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Record or upload a short reference clip for voice cloning (HF spaces, Fish create-voice, etc.).
 */
export default function ReferenceClipCapture({
  variant,
  hint,
  audioBase64,
  audioName,
  onSet,
  onClear,
}: Props) {
  const styles = variantStyles[variant];
  const [isRecording, setIsRecording] = useState(false);
  const [recordError, setRecordError] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const startRecording = async () => {
    setRecordError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stopTracks();
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.includes(',') ? result.split(',')[1] : result;
          const ext = blob.type.includes('webm') ? 'webm' : 'audio';
          onSet(base64, `recording-${Date.now()}.${ext}`, blob.type);
        };
        reader.readAsDataURL(blob);
        mediaRecorderRef.current = null;
      };

      recorder.start(250);
      setIsRecording(true);
    } catch (err: unknown) {
      stopTracks();
      const msg = err instanceof Error ? err.message : 'Microphone access denied';
      setRecordError(msg);
    }
  };

  const stopRecording = () => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    }
    setIsRecording(false);
  };

  if (audioBase64) {
    return (
      <div
        className={`flex items-center justify-between bg-slate-950 border ${styles.bg} rounded px-3 py-1.5 text-xs`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <AudioLines className={`w-3.5 h-3.5 ${styles.icon} flex-shrink-0`} />
          <span className={`font-mono ${styles.text} truncate`}>{audioName}</span>
        </div>
        <button type="button" onClick={onClear} className={`${styles.icon} hover:opacity-80 px-2`}>
          Remove
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className={`flex flex-col sm:flex-row items-stretch gap-2 border-2 border-dashed ${styles.border} rounded-lg p-3 bg-slate-950/40`}
      >
        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border font-mono text-xs transition-colors ${
            isRecording
              ? 'bg-rose-950/50 border-rose-500/60 text-rose-200'
              : `bg-slate-900/80 border-slate-800 ${styles.text} hover:bg-slate-900`
          }`}
        >
          {isRecording ? (
            <>
              <Square className="w-4 h-4 fill-current" />
              Stop recording
            </>
          ) : (
            <>
              <Mic className={`w-4 h-4 ${styles.icon}`} />
              Record reference clip
            </>
          )}
        </button>

        <label className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-slate-800 bg-slate-900/80 cursor-pointer hover:bg-slate-900 text-xs font-mono">
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const { base64, mime } = await fileToBase64(file);
                onSet(base64, file.name, mime);
              } catch {
                setRecordError('Could not read that file');
              }
              e.target.value = '';
            }}
          />
          <Upload className={`w-4 h-4 ${styles.icon}`} />
          <span className={styles.text}>Upload reference clip</span>
        </label>
      </div>
      <span className={`text-[9px] ${styles.icon} opacity-80`}>{hint}</span>
      {recordError ? (
        <span className="text-[9px] text-rose-400">{recordError}</span>
      ) : isRecording ? (
        <span className="text-[9px] text-rose-300 animate-pulse">Recording… speak clearly, then Stop.</span>
      ) : null}
    </div>
  );
}
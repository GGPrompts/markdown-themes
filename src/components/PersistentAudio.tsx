import { useMemo } from 'react';
import type { Tab } from '../hooks/useTabManager';
import { AudioViewer } from './viewers/AudioViewer';

interface PersistentAudioProps {
  tabs: Tab[];
  activeTabId: string | null;
}

const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'webm']);

function isAudioFile(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase();
  return ext ? AUDIO_EXTENSIONS.has(ext) : false;
}

/**
 * PersistentAudio - Keeps audio players mounted across tab switches
 *
 * Renders AudioViewers for all audio tabs, hiding inactive ones.
 * This allows audio to continue playing when switching to other tabs.
 */
export function PersistentAudio({ tabs, activeTabId }: PersistentAudioProps) {
  // Find all audio tabs
  const audioTabs = useMemo(
    () => tabs.filter((tab) => isAudioFile(tab.path)),
    [tabs]
  );

  if (audioTabs.length === 0) return null;

  return (
    <>
      {audioTabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            style={{
              position: isActive ? 'relative' : 'absolute',
              top: isActive ? undefined : 0,
              left: isActive ? undefined : 0,
              right: isActive ? undefined : 0,
              bottom: isActive ? undefined : 0,
              visibility: isActive ? 'visible' : 'hidden',
              pointerEvents: isActive ? 'auto' : 'none',
              // Keep in DOM but hidden to maintain audio playback
              height: isActive ? '100%' : 0,
              overflow: 'hidden',
            }}
          >
            <AudioViewer filePath={tab.path} />
          </div>
        );
      })}
    </>
  );
}

export { isAudioFile };


import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save } from 'lucide-react';
import { UserPreferences, VisualizerTheme } from '../../types';
import { TAG_GROUPS, ADVANCED_TAG_GROUPS } from '../../constants';

interface PreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (preferences: UserPreferences) => void;
  currentPreferences: UserPreferences;
  visualizerTheme: VisualizerTheme;
  onVisualizerThemeChange: (theme: VisualizerTheme) => void;
  showGlow: boolean;
  onGlowToggle: (show: boolean) => void;
}

export const PreferencesModal: React.FC<PreferencesModalProps> = ({
  isOpen,
  onClose,
  onSave,
  currentPreferences,
  visualizerTheme,
  onVisualizerThemeChange,
  showGlow,
  onGlowToggle
}) => {
  const [preferences, setPreferences] = useState<UserPreferences>(currentPreferences);

  useEffect(() => {
    if (isOpen) {
      setPreferences(currentPreferences);
    }
  }, [isOpen, currentPreferences]);

  const toggleTag = (category: 'genres' | 'instruments' | 'vartags', tag: string) => {
    setPreferences(prev => {
      const current = prev[category] || [];
      const updated = current.includes(tag)
        ? current.filter(t => t !== tag)
        : [...current, tag];
      return { ...prev, [category]: updated };
    });
  };

  const handleSave = () => {
    onSave(preferences);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-2xl bg-neutral-900 rounded-2xl border border-white/10 p-6 md:p-8 max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">Preferences</h2>
            <button
              onClick={onClose}
              className="p-2 text-neutral-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="space-y-6">
            {/* Genres */}
            <div>
              <h3 className="text-sm font-semibold text-neutral-300 mb-3 uppercase tracking-wider">
                Preferred Genres
              </h3>
              <div className="flex flex-wrap gap-2">
                {TAG_GROUPS.find(g => g.category === 'genre')?.tags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => toggleTag('genres', tag)}
                    className={`px-3 py-1.5 rounded-full text-xs transition-all ${
                      preferences.genres?.includes(tag)
                        ? 'bg-white text-black border-white'
                        : 'bg-white/5 text-neutral-400 border-white/10 border hover:border-white/30'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Moods */}
            <div>
              <h3 className="text-sm font-semibold text-neutral-300 mb-3 uppercase tracking-wider">
                Preferred Moods
              </h3>
              <div className="flex flex-wrap gap-2">
                {TAG_GROUPS.find(g => g.category === 'mood')?.tags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => toggleTag('vartags', tag)}
                    className={`px-3 py-1.5 rounded-full text-xs transition-all ${
                      preferences.vartags?.includes(tag)
                        ? 'bg-white text-black border-white'
                        : 'bg-white/5 text-neutral-400 border-white/10 border hover:border-white/30'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Themes (Advanced) */}
            <div>
              <h3 className="text-sm font-semibold text-neutral-300 mb-3 uppercase tracking-wider">
                Preferred Themes (Advanced)
              </h3>
              <div className="flex flex-wrap gap-2">
                {ADVANCED_TAG_GROUPS.find(g => g.category === 'themes')?.tags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => toggleTag('vartags', tag)}
                    className={`px-3 py-1.5 rounded-full text-xs transition-all ${
                      preferences.vartags?.includes(tag)
                        ? 'bg-white text-black border-white'
                        : 'bg-white/5 text-neutral-400 border-white/10 border hover:border-white/30'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Glow Effect Toggle */}
            <div className="pt-4 border-t border-white/10">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-neutral-300 mb-2 uppercase tracking-wider">
                  3D Background Theme
                </h3>
                <div className="flex flex-wrap gap-2">
                  {([
                    { value: 'halo', label: 'Milky Way' },
                    { value: 'rainGlass', label: 'Rain Glass (Bokeh)' },
                    { value: 'aurora', label: 'Aurora' },
                  ] as { value: VisualizerTheme; label: string }[]).map((themeOption) => (
                    <button
                      key={themeOption.value}
                      onClick={() => onVisualizerThemeChange(themeOption.value)}
                      className={`px-3 py-1.5 rounded-full text-xs transition-all ${
                        visualizerTheme === themeOption.value
                          ? 'bg-white text-black border-white'
                          : 'bg-white/5 text-neutral-400 border-white/10 border hover:border-white/30'
                      }`}
                    >
                      {themeOption.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-300 mb-1 uppercase tracking-wider">
                    Visual Effects
                  </h3>
                  <p className="text-xs text-neutral-500">Cover glow effect</p>
                </div>
                <button
                  onClick={() => onGlowToggle(!showGlow)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    showGlow ? 'bg-purple-500' : 'bg-neutral-700'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      showGlow ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-white/10">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-neutral-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 rounded-lg bg-white text-black hover:bg-neutral-200 transition-colors flex items-center gap-2 font-semibold"
            >
              <Save className="w-4 h-4" />
              Save Preferences
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

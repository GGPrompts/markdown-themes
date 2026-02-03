import './dark-academia.css';
import './cyberpunk.css';
import './parchment.css';
import './cosmic.css';
import './noir.css';
import './nordic.css';
import './glassmorphism.css';
import './film-grain.css';
import './verdant-grove.css';
import './art-deco.css';
import './knolling.css';
import './industrial.css';
import './streamline-moderne.css';
import './pixel-art.css';

export const themes = [
  { id: 'default', name: 'Default', className: '' },
  { id: 'dark-academia', name: 'Dark Academia', className: 'theme-dark-academia' },
  { id: 'cyberpunk', name: 'Cyberpunk', className: 'theme-cyberpunk' },
  { id: 'parchment', name: 'Parchment', className: 'theme-parchment' },
  { id: 'cosmic', name: 'Cosmic', className: 'theme-cosmic' },
  { id: 'noir', name: 'Noir', className: 'theme-noir' },
  { id: 'nordic', name: 'Nordic', className: 'theme-nordic' },
  { id: 'glassmorphism', name: 'Glassmorphism', className: 'theme-glassmorphism' },
  { id: 'film-grain', name: 'Film Grain', className: 'theme-film-grain' },
  { id: 'verdant-grove', name: 'Verdant Grove', className: 'theme-verdant-grove' },
  { id: 'art-deco', name: 'Art Deco', className: 'theme-art-deco' },
  { id: 'knolling', name: 'Knolling', className: 'theme-knolling' },
  { id: 'industrial', name: 'Industrial', className: 'theme-industrial' },
  { id: 'streamline-moderne', name: 'Streamline Moderne', className: 'theme-streamline-moderne' },
  { id: 'pixel-art', name: 'Pixel Art', className: 'theme-pixel-art' },
] as const;

export type ThemeId = typeof themes[number]['id'];

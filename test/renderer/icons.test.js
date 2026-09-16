// Renderer tests: the inline icon module (ui/icons.js) and the "monochrome
// icons" setting it backs.
'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const readSrc = (rel) => fs.readFileSync(path.join(__dirname, '../../src/renderer', rel), 'utf8');
const ICONS_SRC = readSrc('ui/icons.js');
const PREFERENCES_SRC = readSrc('services/preferences.js');

let dom = null;

function setup(html) {
  dom = new JSDOM(
    `<!DOCTYPE html><html><body>${html || ''}</body></html>`,
    {
      url: 'http://localhost',
      runScripts: 'dangerously',
      beforeParse(window) {
        window.eval(PREFERENCES_SRC);
      }
    }
  );
  dom.window.eval(ICONS_SRC);
  return dom.window;
}

function mono(window, value) {
  window.localStorage.setItem('iconStyle', value ? 'mono' : 'emoji');
}

afterEach(() => {
  if (dom) dom.window.close();
  dom = null;
});

describe('icons module', () => {
  it('returns an inline SVG for a known name', () => {
    const window = setup();
    const svg = window.ui.icons.icon('search');

    assert.ok(svg.startsWith('<svg'), 'must return an svg element');
    assert.ok(svg.includes('stroke="currentColor"'), 'must inherit the text colour');
    assert.ok(svg.includes('class="ui-icon"'), 'must carry the base class');
    assert.ok(svg.includes('aria-hidden="true"'), 'decorative by default');
    assert.ok(svg.includes('</svg>'));
  });

  it('carries its own size, like a glyph', () => {
    const window = setup();
    const svg = window.ui.icons.icon('search');
    const width = (svg.match(/width="([^"]+)"/) || [])[1];
    const height = (svg.match(/height="([^"]+)"/) || [])[1];

    // Without these attributes an <svg> stretches to fill its container: that
    // is what made the icons enormous wherever a CSS rule did not reach them.
    assert.ok(width, 'must declare its width');
    assert.strictEqual(width, height, 'width and height must match');

    // Expressed in em, so the icon scales with the surrounding font exactly
    // like the emoji it replaces. The exact value is a visual choice (it is
    // tuned against the ink size of Noto Color Emoji), so only the unit and a
    // sane range are asserted here.
    const value = parseFloat(width);
    assert.ok(width.endsWith('em'), 'must be relative to the font size, not ' + width);
    assert.ok(value > 0.8 && value < 1.5, 'size should stay near one em, got ' + width);
    assert.strictEqual(svg.includes('px"'), false, 'no fixed pixel size anywhere');
  });

  it('accepts an extra class and refuses unknown names', () => {
    const window = setup();
    const icons = window.ui.icons;

    assert.ok(icons.icon('lock', 'badge-icon').includes('class="ui-icon badge-icon"'));
    assert.strictEqual(icons.icon('does-not-exist'), '', 'unknown icon renders nothing');
    assert.strictEqual(icons.has('search'), true);
    assert.strictEqual(icons.has('does-not-exist'), false);
  });

  it('keeps the emoji and the SVG in the same wrapper', () => {
    // Emoji and monochrome must produce the same markup shape, an inline glyph
    // inside <span class="cat-icon">, so they are laid out identically.
    const window = setup('<button id="categoriesDropdownBtn"></button>');
    window.eval(fs.readFileSync(path.join(__dirname, '../../src/renderer/config/constants.js'), 'utf8'));
    window.eval(readSrc('features/categories/dropdown.js'));
    const dropdown = window.features.categories.dropdown;
    const prefs = window.services.preferences;
    const button = () => window.document.getElementById('categoriesDropdownBtn');

    prefs.saveIconStyle('emoji');
    dropdown.updateDropdownLabel({ activeCategory: 'game' }, (k) => k, window.constants.CATEGORY_ICON_MAP);
    const emojiHtml = button().querySelector('.cat-icon').innerHTML;
    assert.ok(emojiHtml.includes('🎮'), 'emoji glyph inside the wrapper');
    assert.strictEqual(emojiHtml.includes('<svg'), false);

    prefs.saveIconStyle('mono');
    dropdown.updateDropdownLabel({ activeCategory: 'game' }, (k) => k, window.constants.CATEGORY_ICON_MAP);
    const monoHtml = button().querySelector('.cat-icon').innerHTML;
    assert.ok(monoHtml.startsWith('<svg'), 'svg glyph inside the same wrapper');
    assert.strictEqual(button().querySelectorAll('.cat-icon').length, 1, 'one wrapper, not two');
  });

  it('maps every category of the emoji map to an icon it ships', () => {
    const window = setup();
    window.eval(fs.readFileSync(path.join(__dirname, '../../src/renderer/config/constants.js'), 'utf8'));
    const emojiMap = window.constants.CATEGORY_ICON_MAP;
    const icons = window.ui.icons;

    const categories = Object.keys(emojiMap);
    assert.ok(categories.length >= 30, 'the emoji map should still be there');

    const missing = categories.filter((key) => {
      const name = icons.lucideNameForCategory(key);
      return !name || !icons.has(name);
    });
    assert.deepStrictEqual(missing, [], `categories without a usable icon: ${missing.join(', ')}`);
  });

  it('ships every icon the interface asks for', () => {
    const window = setup();
    const icons = window.ui.icons;
    const needed = ['search', 'settings', 'user', 'credit-card', 'lock', 'loader', 'layout-grid', 'package'];
    const missing = needed.filter((n) => !icons.has(n));
    assert.deepStrictEqual(missing, [], `icons missing from the bundle: ${missing.join(', ')}`);
  });

  it('choose() follows the stored preference', () => {
    const window = setup();
    const icons = window.ui.icons;

    assert.strictEqual(icons.preferred(), false, 'emoji is the default');
    assert.strictEqual(icons.choose('lock', 'EMOJI'), 'EMOJI', 'emoji style keeps the emoji');

    mono(window, true);
    assert.strictEqual(icons.preferred(), true);
    assert.ok(icons.choose('lock', 'EMOJI', 'badge-icon').includes('<svg'), 'mono style returns the svg');
    assert.strictEqual(icons.choose('unknown-name', 'EMOJI'), 'EMOJI', 'unknown icon falls back to the emoji');
  });

  it('applyAll() fills the placeholders and can put the emoji back', () => {
    const window = setup('<span class="search-icon" data-icon="search" aria-hidden="true">🔍</span>');
    const doc = window.document;
    const span = doc.querySelector('.search-icon');

    window.ui.icons.applyAll(doc, 'mono');
    assert.ok(span.querySelector('svg'), 'placeholder replaced by the svg');
    assert.strictEqual(span.textContent.trim(), '', 'the emoji is gone');
    assert.strictEqual(span.dataset.emoji, '🔍', 'the emoji is remembered');

    window.ui.icons.applyAll(doc, 'mono');
    assert.strictEqual(span.querySelectorAll('svg').length, 1, 'applying twice does not stack icons');

    window.ui.icons.applyAll(doc, 'emoji');
    assert.strictEqual(span.querySelector('svg'), null, 'svg removed');
    assert.strictEqual(span.textContent.trim(), '🔍', 'emoji restored');
  });

  it('applyAll() leaves elements without data-icon alone', () => {
    const window = setup('<span id="plain">🔍</span><span data-icon="unknown">❓</span>');
    const doc = window.document;

    window.ui.icons.applyAll(doc, 'mono');
    assert.strictEqual(doc.getElementById('plain').textContent, '🔍');
    assert.strictEqual(doc.querySelector('[data-icon="unknown"]').textContent, '❓', 'unknown icon: emoji kept');
  });
});

describe('icon style preference', () => {
  it('defaults to emoji and round-trips through localStorage', () => {
    const window = setup();
    const prefs = window.services.preferences;

    assert.strictEqual(prefs.getIconStyle(), 'emoji', 'default is emoji');

    prefs.saveIconStyle('mono');
    assert.strictEqual(prefs.getIconStyle(), 'mono');
    assert.strictEqual(window.localStorage.getItem('iconStyle'), 'mono');

    prefs.saveIconStyle('emoji');
    assert.strictEqual(prefs.getIconStyle(), 'emoji');
    assert.strictEqual(window.localStorage.getItem('iconStyle'), null, 'default is not stored');
  });

  it('ignores an unexpected stored value', () => {
    const window = setup();
    window.localStorage.setItem('iconStyle', 'rainbow');
    assert.strictEqual(window.services.preferences.getIconStyle(), 'emoji');
  });
});

describe('monochrome icons setting', () => {
  const SETTINGS_SRC = readSrc('ui/settingsPanel.js');

  function setupPanel(initialStyle) {
    const window = setup(
      '<button id="settingsBtn"></button>'
      + '<div id="settingsPanel" hidden>'
      + '<input type="checkbox" id="monoIconsCheckbox">'
      + '</div>'
    );
    const prefs = window.services.preferences;
    if (initialStyle) prefs.saveIconStyle(initialStyle);
    window.eval(SETTINGS_SRC);
    const applied = [];
    window.ui.settingsPanel.init({
      getThemePref: () => 'system',
      applyThemePreference: () => {},
      loadOpenExternalPref: () => false,
      saveOpenExternalPref: () => {},
      getIconStyle: prefs.getIconStyle,
      saveIconStyle: prefs.saveIconStyle,
      onIconStyleChange: (style) => applied.push(style)
    });
    return { window, applied };
  }

  it('reflects the stored preference when the panel is built', () => {
    assert.strictEqual(setupPanel().window.document.getElementById('monoIconsCheckbox').checked, false,
      'unchecked while the emoji style is active');
    dom.window.close();

    const { window } = setupPanel('mono');
    assert.strictEqual(window.document.getElementById('monoIconsCheckbox').checked, true,
      'checked when the monochrome style was saved earlier');
  });

  it('saves the choice and asks for an immediate application', () => {
    const { window, applied } = setupPanel();
    const box = window.document.getElementById('monoIconsCheckbox');

    box.checked = true;
    box.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.strictEqual(window.services.preferences.getIconStyle(), 'mono', 'choice saved');
    assert.deepStrictEqual(applied, ['mono'], 'applyIconStyle called once');

    box.checked = false;
    box.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.strictEqual(window.services.preferences.getIconStyle(), 'emoji', 'back to emoji');
    assert.deepStrictEqual(applied, ['mono', 'emoji']);
  });
});

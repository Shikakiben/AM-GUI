// Renderer tests: screenshot gallery in the details view.
// The real modules are loaded in a jsdom window (ui/gallery.js plus the details
// feature that uses it), so this covers the markup, the delegated controls, the
// lightbox and the keyboard navigation.
'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const readSrc = (rel) => fs.readFileSync(path.join(__dirname, '../../src/renderer', rel), 'utf8');
const GALLERY_SRC = readSrc('ui/gallery.js');
const DETAILS_SRC = readSrc('features/details/index.js');

const STRINGS = {
  // The gallery deliberately adds no translation keys: the arrow labels reuse
  // the ones the featured banner already ships.
  'featured.prev': 'Previous',
  'featured.next': 'Next',
  'details.install': 'Install',
  'details.uninstall': 'Uninstall',
  'install.scope.user': 'User',
  'install.scope.system': 'System',
  'install.status': 'In progress',
  'install.cancel': 'Cancel',
  'details.loadingDesc': 'Loading {name}'
};

const SHOTS = [
  'https://example.test/a.webp',
  'https://example.test/b.webp',
  'https://example.test/c.webp'
];

let dom = null;

function setup(screenshots) {
  dom = new JSDOM(
    '<!DOCTYPE html><html><body class="details-mode">'
    + '<section id="appDetails"><div id="detailsName"></div><div id="detailsLong"></div></section>'
    + '<div id="mdLightbox" style="display:none">'
    + '<button type="button" class="md-lightbox-btn" data-lightbox-dir="-1"></button>'
    + '<img id="mdLightboxImg">'
    + '<button type="button" class="md-lightbox-btn" data-lightbox-dir="1"></button>'
    + '</div>'
    + '</body></html>',
    {
      url: 'http://localhost',
      runScripts: 'dangerously',
      beforeParse(window) {
        window.t = (key, vars) => {
          let out = STRINGS[key] || key;
          if (vars) {
            for (const [name, value] of Object.entries(vars)) {
              out = out.split('{' + name + '}').join(value);
            }
          }
          return out;
        };
        window.marked = { parse: (md) => `<p>${md}</p>` };
        window.utils = { prettifyAppName: (n) => n };
        window.fetch = async () => ({
          ok: true,
          status: 200,
          json: async () => ({ name: 'virtualbox', description: 'A virtualiser.', screenshots })
        });
      }
    }
  );
  return dom.window;
}

function openDetails(window, screenshots) {
  window.eval(GALLERY_SRC);
  window.eval(DETAILS_SRC);
  const api = window.features.details.init({
    state: { allApps: [{ name: 'virtualbox', installed: false }], currentDetailsApp: null },
    translate: window.t
  });
  api.showDetails('virtualbox');
  // let the mocked fetch and its json() resolve
  return new Promise((resolve) => window.setTimeout(() => resolve(api), 0));
}

function click(window, element) {
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

afterEach(() => {
  if (dom) dom.window.close();
  dom = null;
});

describe('details gallery', () => {
  it('renders buttons and one dot per screenshot', async () => {
    const window = setup(SHOTS);
    await openDetails(window, SHOTS);
    const doc = window.document;
    const gallery = doc.querySelector('#detailsLong .gallery');

    assert.ok(gallery, 'gallery block must be rendered');
    assert.strictEqual(gallery.getAttribute('data-gallery-count'), '3');
    assert.strictEqual(doc.querySelector('#detailsLong .gallery h3'), null, 'no heading above the screenshots');
    assert.strictEqual(doc.querySelectorAll('#detailsLong .gallery-dot').length, 3, 'one dot per screenshot');
    assert.strictEqual(doc.querySelectorAll('#detailsLong .gallery-btn').length, 2);
    assert.strictEqual(doc.querySelector('#detailsLong .gallery-img').getAttribute('alt'), 'virtualbox');
    assert.strictEqual(doc.querySelector('#detailsLong .gallery-btn[data-gallery-dir="1"]').getAttribute('aria-label'), 'Next');
  });

  it('starts on the first screenshot with "previous" disabled', async () => {
    const window = setup(SHOTS);
    await openDetails(window, SHOTS);
    const doc = window.document;
    const dots = doc.querySelectorAll('#detailsLong .gallery-dot');

    assert.strictEqual(doc.querySelector('#detailsLong .gallery-img').getAttribute('src'), SHOTS[0]);
    assert.strictEqual(dots[0].classList.contains('active'), true);
    assert.strictEqual(doc.querySelector('#detailsLong .gallery-btn[data-gallery-dir="-1"]').disabled, true);
    assert.strictEqual(doc.querySelector('#detailsLong .gallery-btn[data-gallery-dir="1"]').disabled, false);
  });

  it('advances and goes back with the buttons, disabling the ends', async () => {
    const window = setup(SHOTS);
    await openDetails(window, SHOTS);
    const doc = window.document;
    const next = doc.querySelector('#detailsLong .gallery-btn[data-gallery-dir="1"]');
    const prev = doc.querySelector('#detailsLong .gallery-btn[data-gallery-dir="-1"]');
    const img = doc.querySelector('#detailsLong .gallery-img');

    click(window, next);
    assert.strictEqual(img.getAttribute('src'), SHOTS[1], 'second screenshot after one click');
    assert.strictEqual(prev.disabled, false, 'previous becomes available');
    assert.strictEqual(doc.querySelectorAll('#detailsLong .gallery-dot')[1].classList.contains('active'), true);

    click(window, next);
    assert.strictEqual(img.getAttribute('src'), SHOTS[2]);
    assert.strictEqual(next.disabled, true, 'next disabled on the last screenshot');
    assert.strictEqual(img.getAttribute('alt'), 'virtualbox', 'alt stays the app name');

    click(window, prev);
    assert.strictEqual(img.getAttribute('src'), SHOTS[1], 'back to the second screenshot');
  });

  it('jumps to a screenshot when its dot is clicked', async () => {
    const window = setup(SHOTS);
    await openDetails(window, SHOTS);
    const doc = window.document;
    const dots = doc.querySelectorAll('#detailsLong .gallery-dot');

    click(window, dots[2]);
    assert.strictEqual(doc.querySelector('#detailsLong .gallery-img').getAttribute('src'), SHOTS[2]);
    assert.strictEqual(dots[2].classList.contains('active'), true);
    assert.strictEqual(dots[0].classList.contains('active'), false, 'only one active dot');
  });

  it('navigates with the arrow keys', async () => {
    const window = setup(SHOTS);
    await openDetails(window, SHOTS);
    const doc = window.document;
    const img = doc.querySelector('#detailsLong .gallery-img');

    doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.strictEqual(img.getAttribute('src'), SHOTS[1]);

    doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    assert.strictEqual(img.getAttribute('src'), SHOTS[0]);

    doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    assert.strictEqual(img.getAttribute('src'), SHOTS[0], 'stays on the first screenshot');
  });

  it('opens the lightbox when the displayed screenshot is clicked', async () => {
    const window = setup(SHOTS);
    await openDetails(window, SHOTS);
    const doc = window.document;

    click(window, doc.querySelector('#detailsLong .gallery-img'));
    assert.strictEqual(doc.getElementById('mdLightbox').style.display, 'flex');
    assert.ok(doc.getElementById('mdLightboxImg').getAttribute('src').includes('a.webp'));
  });

  it('browses the gallery from inside the lightbox', async () => {
    const window = setup(SHOTS);
    await openDetails(window, SHOTS);
    const doc = window.document;
    const galleryImg = doc.querySelector('#detailsLong .gallery-img');
    const lightboxImg = doc.getElementById('mdLightboxImg');

    click(window, galleryImg);
    doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.ok(lightboxImg.getAttribute('src').includes('b.webp'), 'lightbox follows the arrow key');
    assert.ok(galleryImg.getAttribute('src').includes('b.webp'), 'gallery stays in sync');

    doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.ok(lightboxImg.getAttribute('src').includes('c.webp'));
    // last screenshot: the arrow keys stop, exactly like the disabled button
    doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.ok(lightboxImg.getAttribute('src').includes('c.webp'), 'no wrapping past the last screenshot');

    // closing the lightbox leaves the gallery where the reader stopped
    click(window, doc.getElementById('mdLightbox'));
    assert.strictEqual(doc.getElementById('mdLightbox').style.display, 'none');
    assert.ok(galleryImg.getAttribute('src').includes('c.webp'), 'gallery keeps the last browsed screenshot');
  });

  it('ignores the arrow keys for a description image outside the gallery', async () => {
    const window = setup(SHOTS);
    await openDetails(window, SHOTS);
    const doc = window.document;
    const galleryImg = doc.querySelector('#detailsLong .gallery-img');

    const plain = doc.createElement('img');
    plain.src = 'https://example.test/diagram.webp';
    doc.getElementById('detailsLong').appendChild(plain);

    click(window, plain);
    assert.strictEqual(doc.getElementById('mdLightbox').style.display, 'flex');

    doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.ok(doc.getElementById('mdLightboxImg').getAttribute('src').includes('diagram.webp'), 'lightbox unchanged');
    assert.ok(galleryImg.getAttribute('src').includes('a.webp'), 'gallery unchanged');
  });

  it('browses the gallery with the lightbox arrows', async () => {
    const window = setup(SHOTS);
    await openDetails(window, SHOTS);
    const doc = window.document;
    const lightbox = doc.getElementById('mdLightbox');
    const lightboxImg = doc.getElementById('mdLightboxImg');
    const prev = doc.querySelector('.md-lightbox-btn[data-lightbox-dir="-1"]');
    const next = doc.querySelector('.md-lightbox-btn[data-lightbox-dir="1"]');

    assert.strictEqual(lightbox.classList.contains('has-gallery'), false, 'no arrows before opening a screenshot');

    click(window, doc.querySelector('#detailsLong .gallery-img'));
    assert.strictEqual(lightbox.classList.contains('has-gallery'), true, 'arrows shown for a gallery');
    assert.strictEqual(prev.disabled, true, 'previous disabled on the first screenshot');
    assert.strictEqual(prev.getAttribute('aria-label'), 'Previous');
    assert.strictEqual(next.getAttribute('aria-label'), 'Next');

    click(window, next);
    assert.ok(lightboxImg.getAttribute('src').includes('b.webp'), 'arrow moves the lightbox image');
    assert.strictEqual(lightbox.style.display, 'flex', 'arrow click must not close the lightbox');
    assert.strictEqual(prev.disabled, false);

    click(window, next);
    click(window, next);
    assert.ok(lightboxImg.getAttribute('src').includes('c.webp'), 'stops on the last screenshot');
    assert.strictEqual(next.disabled, true);

    click(window, prev);
    assert.ok(lightboxImg.getAttribute('src').includes('b.webp'), 'previous arrow goes back');
  });

  it('hides the lightbox arrows for a single screenshot', async () => {
    const one = [SHOTS[0]];
    const window = setup(one);
    await openDetails(window, one);
    const doc = window.document;

    click(window, doc.querySelector('#detailsLong .gallery-img'));
    assert.strictEqual(doc.getElementById('mdLightbox').classList.contains('has-gallery'), false);
    doc.querySelectorAll('.md-lightbox-btn').forEach((btn) => {
      assert.strictEqual(btn.disabled, true, 'arrows disabled when there is nothing to browse');
    });
  });

  it('browses the gallery with the mouse wheel inside the lightbox', async () => {
    const window = setup(SHOTS);
    await openDetails(window, SHOTS);
    const doc = window.document;
    const lightbox = doc.getElementById('mdLightbox');
    const lightboxImg = doc.getElementById('mdLightboxImg');

    const wheel = (deltaY) => lightbox.dispatchEvent(
      new window.WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true })
    );

    // outside the lightbox the wheel must do nothing
    wheel(120);
    assert.ok(doc.querySelector('#detailsLong .gallery-img').getAttribute('src').includes('a.webp'));

    click(window, doc.querySelector('#detailsLong .gallery-img'));
    wheel(120);
    assert.ok(lightboxImg.getAttribute('src').includes('b.webp'), 'wheel down goes forward');

    // the same burst is throttled: one notch does not skip two screenshots
    wheel(120);
    wheel(120);
    assert.ok(lightboxImg.getAttribute('src').includes('b.webp'), 'burst of wheel events is throttled');

    await new Promise((resolve) => window.setTimeout(resolve, 320));
    wheel(-120);
    assert.ok(lightboxImg.getAttribute('src').includes('a.webp'), 'wheel up goes back after the throttle window');
  });

  it('renders a single screenshot without any control', async () => {
    const one = [SHOTS[0]];
    const window = setup(one);
    await openDetails(window, one);
    const doc = window.document;

    assert.ok(doc.querySelector('#detailsLong .gallery'), 'gallery block still rendered');
    assert.strictEqual(doc.querySelectorAll('#detailsLong .gallery-btn').length, 0, 'no arrows for a single image');
    assert.strictEqual(doc.querySelectorAll('#detailsLong .gallery-dot').length, 0, 'no dots for a single image');
    assert.strictEqual(doc.querySelector('#detailsLong .gallery-img').getAttribute('src'), SHOTS[0]);
  });

  it('keeps the displayed screenshot when the description is re-rendered', async () => {
    const window = setup(SHOTS);
    const api = await openDetails(window, SHOTS);
    const doc = window.document;

    click(window, doc.querySelector('#detailsLong .gallery-btn[data-gallery-dir="1"]'));
    assert.strictEqual(doc.querySelector('#detailsLong .gallery-img').getAttribute('src'), SHOTS[1]);

    api.refreshDescription();
    const img = doc.querySelector('#detailsLong .gallery-img');
    assert.strictEqual(img.getAttribute('src'), SHOTS[1], 'still on the second screenshot after a re-render');
    assert.strictEqual(doc.querySelector('#detailsLong .gallery').getAttribute('data-gallery-index'), '1');
    assert.strictEqual(doc.querySelector('#detailsLong .gallery-btn[data-gallery-dir="-1"]').disabled, false);
  });
});

// The module on its own, through its public API (html / refresh / attach).
function galleryApiOf(window) {
  window.eval(GALLERY_SRC);
  return (options) => window.ui.gallery.init(Object.assign({ t: window.t }, options));
}

describe('gallery module', () => {
  it('renders nothing without a screenshot', () => {
    const window = setup([]);
    const init = galleryApiOf(window);

    assert.strictEqual(init().html([], 'app'), '');
    assert.strictEqual(init().html(null, 'app'), '');
  });

  it('escapes the screenshot URLs and the app name', () => {
    const window = setup([]);
    const init = galleryApiOf(window);
    const markup = init().html(['https://x.test/a"onmouseover="alert(1).webp', 'https://x.test/b.webp'], 'ap<p>p');

    assert.strictEqual(markup.includes('onmouseover="alert(1)'), false, 'a URL cannot break out of the attribute');
    assert.strictEqual(markup.includes('<p>'), false, 'the app name cannot inject a tag');
    assert.ok(markup.includes('&quot;'), 'quotes are escaped');
  });

  it('ignores the arrow keys while isActive() is false', () => {
    const window = setup(SHOTS);
    const init = galleryApiOf(window);
    const doc = window.document;
    const container = doc.createElement('div');
    doc.body.appendChild(container);

    let active = false;
    const gallery = init({ isActive: () => active });
    container.innerHTML = gallery.html(SHOTS, 'virtualbox');
    gallery.attach(container);
    const img = () => container.querySelector('.gallery-img').getAttribute('src');

    doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.ok(img().includes('a.webp'), 'inactive: the arrow key is ignored');

    active = true;
    doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.ok(img().includes('b.webp'), 'active: the arrow key moves the gallery');
  });

  it('does not wrap and keeps a single screenshot free of controls', () => {
    const window = setup(SHOTS);
    const init = galleryApiOf(window);
    const doc = window.document;
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    const gallery = init();
    gallery.attach(container);

    container.innerHTML = gallery.html([SHOTS[0]], 'virtualbox');
    gallery.refresh(container, 'virtualbox');
    assert.strictEqual(container.querySelectorAll('.gallery-btn').length, 0);
    assert.strictEqual(container.querySelectorAll('.gallery-dot').length, 0);
  });
});

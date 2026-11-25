import { formatSheetDate } from "../../system/FalloutClock.mjs";

/**
 * Classic (Fallout 1/2 style) actor sheet frame, shared by the character,
 * NPC, creature and settlement sheets.
 *
 * Purely cosmetic: each classic sheet inherits every listener, data
 * preparation and update path from the original sheet it wraps, and reuses
 * the original tab partials. The artwork (assets/ui/classic/character_sheet.webp)
 * has a name bar, a portrait screen, a black panel holding six buttons, a
 * small info screen (bottom left) and the main screen (right) for the tabs.
 *
 * A sheet lists its buttons in `classicButtons`: { tab, label } for a tab,
 * or null for a blank button (it buzzes and stays up).
 */
export const ClassicSheetMixin = Base => class extends Base {

	/** Artwork size in pixels; every overlay is positioned in these pixels. */
	static BACKDROP = { width: 1726, height: 1063 };

	/** Fallout 2 interface click (sound/sfx/butin4.acm) for the buttons. */
	static BUTTON_SOUND = "systems/fallout/assets/sounds/classic/butin4.ogg";

	/** Van Buren refusal (IISXXXX1) for a blank button. */
	static BLANK_SOUND = "systems/fallout/assets/sounds/classic/iisxxxx1.ogg";

	/** Shift+wheel zoom limits and step per wheel notch. */
	static ZOOM = { min: 1, max: 4, step: 1.15 };

	/** Largest and smallest name size on the name bar (px). */
	static NAME_FONT = { max: 64, min: 22 };

	/** Current zoom of each screen (by data-screen), kept across re-renders. */
	_screenZoom = {};

	/** Folded sections (by data-fold), kept across re-renders. */
	_folded = new Set();

	/** @override */
	static get defaultOptions() {
		const options = super.defaultOptions;
		options.classes = [...options.classes, "classic-actor"];
		// Native artwork size, shrunk to fit the screen if needed.
		const header = 30;
		const { width, height } = this.BACKDROP;
		const scale = Math.min(1,
			((window.innerHeight || 1080) - 20 - header) / height,
			((window.innerWidth || 1920) - 120) / width
		);
		options.width = Math.round(width * scale);
		options.height = Math.round(height * scale) + header;
		options.resizable = true;
		options.scrollY = [".classic-screen-main .tab"];
		return options;
	}

	/** Buttons from the top down: { tab, label } or null for a blank one. */
	get classicButtons() {
		return [];
	}

	/** @override */
	async getData(options) {
		const context = await super.getData(options);
		context.classicButtons = this.classicButtons.map(b => (b
			? { tab: b.tab, label: game.i18n.localize(b.label) }
			: null
		));
		return context;
	}

	/** @override */
	activateListeners(html) {
		super.activateListeners(html);

		// Effects tabs are left out of the classic sheets; if a stale tab
		// memory points at a tab this sheet lacks, go to its first button.
		const tabs = this._tabs?.[0];
		const known = this.classicButtons.filter(b => b).map(b => b.tab);
		if (tabs && known.length && !known.includes(tabs.active)) {
			tabs.activate(known[0]);
		}

		// Keep the artwork's aspect ratio when the window is resized.
		this._fitBackdrop();

		// Game date and time (read-only; FalloutClock keeps it current).
		const date = html[0].querySelector(".classic-date");
		if (date) {
			date.textContent = formatSheetDate();
		}

		// The name fills the bar without running off either end.
		const name = html[0].querySelector(".classic-name");
		if (name) {
			this._fitName(name);
			document.fonts?.ready.then(() => this._fitName(name));
			name.addEventListener("input", () => this._fitName(name));
		}

		// Button clicks (local to the clicking user only); blank buttons buzz
		// and stay up.
		html.find(".classic-buttons .item").on("click", () => this._playSound(this.constructor.BUTTON_SOUND));
		html.find(".classic-buttons .classic-blank").on("click", event => {
			event.preventDefault();
			this._playSound(this.constructor.BLANK_SOUND);
		});

		// Sections with data-fold fold away when their title is clicked.
		for (const fold of html[0].querySelectorAll("[data-fold]")) {
			fold.classList.toggle("folded", this._folded.has(fold.dataset.fold));
		}
		html.on("click", "[data-fold] > .classic-divider, [data-fold] > .items-list > .items-header > .item-name", event => {
			const fold = event.currentTarget.closest("[data-fold]");
			const key = fold.dataset.fold;
			if (this._folded.has(key)) {
				this._folded.delete(key);
			}
			else {
				this._folded.add(key);
			}
			fold.classList.toggle("folded", this._folded.has(key));
		});

		// Apparel resistances: drop the spacing characters around each value
		// so symbol and value centre on each other.
		for (const span of html[0].querySelectorAll(".tab.apparel li.item.apparel .item-info > .text-center:last-child > span")) {
			for (const node of [...span.childNodes]) {
				if (node.nodeType === Node.TEXT_NODE) {
					node.textContent = node.textContent.replace(/[\s\u00a0]+/g, "");
				}
			}
		}

		// Body diagram: draw the line art in the header-bar green by using
		// each part's picture as a mask over a flat colour.
		for (const part of html[0].querySelectorAll(".pipboy-status-screen .body-part")) {
			const image = getComputedStyle(part).backgroundImage;
			if (image && image !== "none") {
				part.style.setProperty("-webkit-mask-image", image);
				part.style.setProperty("mask-image", image);
				part.classList.add("classic-masked");
			}
		}

		// Shift+wheel zooms the contents of the screen under the cursor.
		for (const screen of html[0].querySelectorAll(".classic-screen")) {
			const key = screen.dataset.screen;
			this._applyScreenZoom(screen, this._screenZoom[key]);
			screen.addEventListener("wheel", event => this._onScreenWheel(event, screen, key), { passive: false });
			this._enableRightDragPan(screen, key);
		}
	}

	/** Size the name to the bar: as tall as the bar allows, smaller if long. */
	_fitName(input) {
		const { max, min } = this.constructor.NAME_FONT;
		const style = getComputedStyle(input);
		const room = input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
		if (!(room > 0)) {
			return;
		}
		const text = input.value || input.placeholder || "";
		const ctx = (this._measure ??= document.createElement("canvas").getContext("2d"));
		ctx.font = `${max}px ${style.fontFamily}`;
		const width = ctx.measureText(text).width;
		const size = width > room ? Math.max(min, Math.floor(max * room / width)) : max;
		input.style.fontSize = `${size}px`;
	}

	/**
	 * Right-drag pans a zoomed screen. A right click that does not move still
	 * reaches the sheet as usual (e.g. marking a treated injury).
	 */
	_enableRightDragPan(screen, key) {
		const THRESHOLD = 4; // px of movement before a right press becomes a pan
		let drag = null;
		let swallowContextMenu = false;

		screen.addEventListener("pointerdown", event => {
			if (event.button !== 2 || !this._screenZoom[key]) {
				return;
			}
			drag = {
				id: event.pointerId,
				startX: event.clientX,
				startY: event.clientY,
				zoom: { ...this._screenZoom[key] },
				panning: false,
			};
		});

		screen.addEventListener("pointermove", event => {
			if (!drag || event.pointerId !== drag.id) {
				return;
			}
			const dx = event.clientX - drag.startX;
			const dy = event.clientY - drag.startY;
			if (!drag.panning) {
				if (Math.hypot(dx, dy) < THRESHOLD) {
					return;
				}
				drag.panning = true;
				screen.setPointerCapture(event.pointerId);
				screen.classList.add("panning");
			}
			event.preventDefault();

			const rect = screen.getBoundingClientRect();
			const k = rect.width / screen.offsetWidth || 1;
			const { s, x, y } = drag.zoom;
			const w = screen.offsetWidth;
			const h = screen.offsetHeight;
			const zoom = {
				s,
				x: Math.min(0, Math.max(w - (w * s), x + (dx / k))),
				y: Math.min(0, Math.max(h - (h * s), y + (dy / k))),
			};
			this._screenZoom[key] = zoom;
			this._applyScreenZoom(screen, zoom);
		});

		const end = event => {
			if (!drag || event.pointerId !== drag.id) {
				return;
			}
			if (drag.panning) {
				swallowContextMenu = true;
				screen.classList.remove("panning");
				if (screen.hasPointerCapture(event.pointerId)) {
					screen.releasePointerCapture(event.pointerId);
				}
			}
			drag = null;
		};
		screen.addEventListener("pointerup", end);
		screen.addEventListener("pointercancel", end);

		// The context menu after a pan must not act on what is under the cursor.
		screen.addEventListener("contextmenu", event => {
			if (!swallowContextMenu) {
				return;
			}
			swallowContextMenu = false;
			event.preventDefault();
			event.stopImmediatePropagation();
		}, { capture: true });
	}

	_playSound(src) {
		foundry.audio.AudioHelper.play({ src, volume: 0.8, loop: false, channel: "interface" }, false);
	}

	/**
	 * Zoom a screen's contents around the cursor. Never below 100%; at 100% the
	 * contents sit exactly where they were drawn.
	 */
	_onScreenWheel(event, screen, key) {
		if (!event.shiftKey) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();

		const { min, max, step } = this.constructor.ZOOM;
		const zoom = this._screenZoom[key] ?? { s: 1, x: 0, y: 0 };

		// Shift turns a vertical wheel into a horizontal one on some systems.
		const delta = event.deltaY || event.deltaX;
		if (!delta) {
			return;
		}
		const s = Math.min(max, Math.max(min, zoom.s * (delta < 0 ? step : 1 / step)));
		if (s === zoom.s) {
			return;
		}

		// Cursor in the screen's own (unscaled) pixels; the form itself is
		// scaled to the window by --classic-scale.
		const rect = screen.getBoundingClientRect();
		const k = rect.width / screen.offsetWidth || 1;
		const mx = (event.clientX - rect.left) / k;
		const my = (event.clientY - rect.top) / k;

		// Keep the content point under the cursor fixed, then keep the
		// screen covered (no gaps at the edges).
		const px = (mx - zoom.x) / zoom.s;
		const py = (my - zoom.y) / zoom.s;
		const w = screen.offsetWidth;
		const h = screen.offsetHeight;
		const x = Math.min(0, Math.max(w - (w * s), mx - (px * s)));
		const y = Math.min(0, Math.max(h - (h * s), my - (py * s)));

		this._screenZoom[key] = s === 1 ? undefined : { s, x, y };
		this._applyScreenZoom(screen, this._screenZoom[key]);
	}

	_applyScreenZoom(screen, zoom) {
		const layer = screen.querySelector(":scope > .classic-zoom");
		if (!layer) {
			return;
		}
		const { s = 1, x = 0, y = 0 } = zoom ?? {};
		layer.style.setProperty("--zoom", s);
		layer.style.setProperty("--zoom-x", `${x}px`);
		layer.style.setProperty("--zoom-y", `${y}px`);
		screen.classList.toggle("zoomed", s > 1);
	}

	/** @override */
	async close(options = {}) {
		this._screenZoom = {}; // always reopen at 100%
		return super.close(options);
	}

	/** @override */
	setPosition(position = {}) {
		const result = super.setPosition(position);
		this._fitBackdrop();
		return result;
	}

	_fitBackdrop() {
		const el = this.element?.[0];
		const content = el?.querySelector(".window-content");
		const form = content?.querySelector("form.classic-sheet");
		if (!form) {
			return;
		}
		const { width, height } = this.constructor.BACKDROP;
		const scale = Math.min(
			content.clientWidth / width,
			content.clientHeight / height
		);
		form.style.setProperty("--classic-scale", Math.max(scale, 0.2));
		const name = form.querySelector(".classic-name");
		if (name) {
			this._fitName(name);
		}
	}
};

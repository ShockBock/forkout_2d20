import FalloutPcSheet from "./FalloutPcSheet.mjs";
import { formatSheetDate } from "../system/FalloutClock.mjs";

/**
 * Classic (Fallout 1/2 style) character sheet.
 *
 * Purely cosmetic: it inherits every listener, data preparation and update
 * path from FalloutPcSheet and reuses the same tab partials, laid out on a
 * two-screen green CRT backdrop. The Effects tab is left out.
 */
export default class FalloutClassicPcSheet extends FalloutPcSheet {

	/** Backdrop size in pixels; every overlay is positioned as a share of it. */
	static BACKDROP = { width: 886, height: 1026 };

	/** Fallout 2 interface click (sound/sfx/butin4.acm) for the button row. */
	static BUTTON_SOUND = "systems/fallout/assets/sounds/classic/butin4.ogg";

	/** Shift+wheel zoom limits and step per wheel notch. */
	static ZOOM = { min: 1, max: 4, step: 1.15 };

	/** Current zoom of each screen ("top", "bottom"), kept across re-renders. */
	_screenZoom = {};

	/** @override */
	static get defaultOptions() {
		const options = super.defaultOptions;
		options.classes = [...options.classes, "classic-pc"];
		// Native backdrop size, shrunk to fit the screen height if needed.
		const header = 30;
		const scale = Math.min(1, ((window.innerHeight || 1080) - 20 - header) / this.BACKDROP.height);
		options.width = Math.round(this.BACKDROP.width * scale);
		options.height = Math.round(this.BACKDROP.height * scale) + header;
		options.resizable = true;
		options.scrollY = [".classic-screen-bottom .tab"];
		return options;
	}

	/** @override */
	get template() {
		return "systems/fallout/templates/actor/classic/pc-sheet.hbs";
	}

	/** @override */
	activateListeners(html) {
		super.activateListeners(html);

		// The old sheet showed the Effects tab; if a stale tab memory points at
		// it, fall back to Status.
		if (this._tabs?.[0]?.active === "effects") {
			this._tabs[0].activate("status");
		}

		// Keep the backdrop's aspect ratio when the window is resized.
		this._fitBackdrop();

		// Game date and time (read-only; FalloutClock keeps it current).
		const date = html[0].querySelector(".classic-date");
		if (date) {
			date.textContent = formatSheetDate();
		}

		// Button row click sound (local to the clicking user only).
		html.find(".classic-buttons .item").on("click", () => this._playButtonSound());

		// Shift+wheel zooms the contents of the screen under the cursor.
		for (const screen of html[0].querySelectorAll(".classic-screen")) {
			const key = screen.classList.contains("classic-screen-top") ? "top" : "bottom";
			this._applyScreenZoom(screen, this._screenZoom[key]);
			screen.addEventListener("wheel", event => this._onScreenWheel(event, screen, key), { passive: false });
			this._enableRightDragPan(screen, key);
		}
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
				x: Math.min(0, Math.max(w - w * s, x + dx / k)),
				y: Math.min(0, Math.max(h - h * s, y + dy / k)),
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

	_playButtonSound() {
		foundry.audio.AudioHelper.play({
			src: this.constructor.BUTTON_SOUND,
			volume: 0.8,
			loop: false,
			channel: "interface",
		}, false);
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
		const x = Math.min(0, Math.max(w - w * s, mx - px * s));
		const y = Math.min(0, Math.max(h - h * s, my - py * s));

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
		form.style.setProperty("--classic-scale", Math.max(scale, 0.3));
	}
}

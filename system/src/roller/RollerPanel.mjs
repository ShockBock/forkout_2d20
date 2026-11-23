/**
 * The live parts of a Forkout roll panel (the control-panel artwork dialogs):
 * rotary counters that scroll, plus / minus keys, the mouse wheel over a
 * counter, and the Van Buren key sounds.
 *
 * Markup (see templates/dialogs/dialog2d20.hbs):
 * - a hidden input per counter: <input type="hidden" name="FIELD" value="N">
 * - one or more dials: <div class="fr-dial" data-field="FIELD" data-place="all|tens|units">
 *   ("all" shows the whole number on one drum; "tens" and "units" share it
 *   out over two drums like an odometer)
 * - keys: <a class="fr-key" data-field="FIELD" data-delta="1|-1">
 * - every <a> directly in .fr-panel clicks when pressed.
 */

/** Van Buren interface click (IB1P1XX1) for every key on a roll panel. */
export const BUTTON_SOUND = "systems/fallout/assets/sounds/classic/ib1p1xx1.ogg";

/** Van Buren refusal (IISXXXX1) when a counter is pushed past its limit. */
export const LIMIT_SOUND = "systems/fallout/assets/sounds/classic/iisxxxx1.ogg";

export function playSound(src) {
	foundry.audio.AudioHelper.play({ src, volume: 0.8, loop: false, channel: "interface" }, false);
}

export class RollerPanel {
	/**
	 * @param {jQuery} html   the dialog content
	 * @param {Object<string, number[]>} limits   [min, max] per counter field
	 */
	constructor(html, limits) {
		this.html = html;
		this.limits = limits;
		this.limitSoundAt = 0;
	}

	activate() {
		const html = this.html;
		this.#buildDials();

		// every key on the panel clicks as it goes down; a counter key that
		// would go past the counter's limit sounds the refusal instead
		html.on("pointerdown", ".fr-panel > a", e => {
			if (e.button !== 0) {
				return;
			}
			const { field, delta } = e.currentTarget.dataset;
			playSound(field && this.atLimit(field, Number(delta)) ? LIMIT_SOUND : BUTTON_SOUND);
		});

		// plus / minus keys, and the mouse wheel over a dial
		html.on("click", ".fr-key", e => {
			const { field, delta } = e.currentTarget.dataset;
			this.step(field, Number(delta));
		});
		html.on("wheel", ".fr-dial", e => {
			e.preventDefault();
			const dy = e.originalEvent?.deltaY ?? 0;
			if (!dy) {
				return;
			}
			const field = e.currentTarget.dataset.field;
			const delta = dy < 0 ? 1 : -1;
			if (this.atLimit(field, delta)) {
				// once per spin of the wheel, not once per wheel tick
				const now = Date.now();
				if ((now - this.limitSoundAt) > 400) {
					playSound(LIMIT_SOUND);
				}
				this.limitSoundAt = now;
				return;
			}
			this.step(field, delta);
		});
	}

	/** A counter's value, kept within its limits. */
	value(field) {
		const [min, max] = this.limits[field];
		const v = Math.round(Number(this.html.find(`[name="${field}"]`).val()));
		return Math.max(min, Math.min(max, Number.isFinite(v) ? v : min));
	}

	/** Would this step take the counter past its limit? */
	atLimit(field, delta) {
		const [min, max] = this.limits[field];
		const next = this.value(field) + delta;
		return (next < min) || (next > max);
	}

	step(field, delta) {
		const old = this.value(field);
		const [min, max] = this.limits[field];
		const value = Math.max(min, Math.min(max, old + delta));
		if (value === old) {
			return;
		}
		this.html.find(`[name="${field}"]`).val(value);
		this.html.find(`.fr-dial[data-field="${field}"]`).each((i, dial) => {
			const place = dial.dataset.place;
			this.#settle(dial);
			let index = RollerPanel.#cellIndex(place, value);
			if (place === "units") {
				const from = Number(dial.dataset.index);
				// roll forward past 9 onto the spare 0, back past 0 onto the spare 9
				if ((delta > 0) && (from === 10) && (index === 1)) {
					index = 11;
				}
				else if ((delta < 0) && (from === 1) && (index === 10)) {
					index = 0;
				}
			}
			if (index !== Number(dial.dataset.index)) {
				this.#place(dial, index, true);
			}
		});
	}

	/* ------------------------------ dials ------------------------------ */

	/** The digits a dial shows: one cell per value it can stand on. */
	#cells(field, place) {
		const [, max] = this.limits[field];
		if (place === "units") {
			// 9 above 0 and 0 below 9, so the drum can roll round
			return [9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
		}
		const top = (place === "tens") ? Math.floor(max / 10) : max;
		return Array.from({ length: top + 1 }, (v, n) => n);
	}

	/** Which cell a dial stands on for a counter value. */
	static #cellIndex(place, value) {
		if (place === "units") {
			return (value % 10) + 1;
		}
		if (place === "tens") {
			return Math.floor(value / 10);
		}
		return value;
	}

	#buildDials() {
		this.html.find(".fr-dial").each((i, dial) => {
			const { field, place } = dial.dataset;
			const strip = document.createElement("div");
			strip.className = "fr-strip";
			strip.innerHTML = this.#cells(field, place)
				.map(n => `<span class="${n >= 10 ? "two" : ""}">${n}</span>`)
				.join("");
			dial.append(strip);
			strip.addEventListener("transitionend", () => this.#settle(dial));
			// the counters can't show more than their limits: roll what they show
			const value = this.value(field);
			this.html.find(`[name="${field}"]`).val(value);
			this.#place(dial, RollerPanel.#cellIndex(place, value), false);
		});
	}

	/** Roll a dial to a cell (animated or not). */
	#place(dial, index, animate) {
		const strip = dial.querySelector(".fr-strip");
		const cell = strip.firstElementChild?.offsetHeight || 0;
		const offset = (((dial.offsetHeight || 0) - cell) / 2) - (index * cell);
		strip.classList.toggle("moving", animate);
		strip.style.transform = `translateY(${offset}px)`;
		dial.dataset.index = index;
	}

	/** After rolling onto a spare cell (past 9 or 0), jump to its twin. */
	#settle(dial) {
		if (dial.dataset.place !== "units") {
			return;
		}
		const index = Number(dial.dataset.index);
		if ((index === 0) || (index === 11)) {
			this.#place(dial, index === 0 ? 10 : 1, false);
			dial.getBoundingClientRect(); // apply before the next move
		}
	}
}

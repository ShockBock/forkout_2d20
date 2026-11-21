import {
	MAX_RATE,
	clampRate,
	dateOf,
	monthDays,
	monthNames,
	timeOf,
} from "../system/FalloutClock.mjs";

const { ApplicationV2 } = foundry.applications.api;

/** Clock speed <-> slider position (0-1000, logarithmic: each step multiplies the speed alike). */
const rateToSlider = r => Math.round((1000 * Math.log(clampRate(r))) / Math.log(MAX_RATE));
const sliderToRate = v => clampRate(Math.exp((Number(v) / 1000) * Math.log(MAX_RATE)));

function rateHint(r) {
	const n = x => String(Number(x.toFixed(1)));
	if (r === 1) return "×1, real time: a game minute takes a real minute.";
	if (r < 60) return `×${r}: a game minute takes ${n(60 / r)} real seconds.`;
	return `×${r}: a game hour takes ${n(3600 / r)} real seconds.`;
}

const pad = n => String(n).padStart(2, "0");

/**
 * The game's date and time, and the clock speed (GM only). Opened from
 * Game Settings and by the "Date and Time" macro (fallout.apps.FalloutDateTime.open()).
 */
export default class FalloutDateTime extends ApplicationV2 {
	static DEFAULT_OPTIONS = {
		id: "fallout-date-time",
		tag: "form",
		classes: ["fallout-date-time", "standard-form"],
		window: { title: "Date and Time", icon: "fa-solid fa-clock", resizable: true },
		position: { width: 560, height: "auto" },
		form: { handler: FalloutDateTime.#onSubmit, submitOnChange: true, closeOnSubmit: false },
		actions: { advance: FalloutDateTime.#onAdvance },
	};

	/** Open the window (or bring it to the front). */
	static open() {
		if (!game.user.isGM) return ui.notifications.warn("Only a GM can set the date and time.");
		const app = foundry.applications.instances.get(this.DEFAULT_OPTIONS.id) ?? new this();
		return app.render({ force: true });
	}

	constructor(options) {
		super(options);
		// the fields follow the world clock (unless one is being typed in)
		this._timeHook = Hooks.on("updateWorldTime", () => this.#showTime());
		// toggles shared with Game Settings follow changes made there
		this._settingHooks = ["createSetting", "updateSetting"].map(
			hook => [hook, Hooks.on(hook, setting => this.#showSetting(setting))]
		);
	}

	_onClose(options) {
		Hooks.off("updateWorldTime", this._timeHook);
		for (const [hook, id] of this._settingHooks) Hooks.off(hook, id);
		super._onClose(options);
	}

	/** Settings shown as checkboxes here, by name. */
	static TOGGLES = ["conditionsSkipMissingPlayers"];

	#showSetting(setting) {
		const [ns, key] = setting.key.split(".");
		if (ns !== SYSTEM_ID || !FalloutDateTime.TOGGLES.includes(key)) return;
		const box = this.element?.querySelector(`[name=${key}]`);
		if (box) box.checked = game.settings.get(SYSTEM_ID, key);
	}

	async _renderHTML() {
		const rate = clampRate(game.settings.get(SYSTEM_ID, "timeRate"));
		const d = dateOf();
		const months = monthNames()
			.map((m, i) => `<option value="${i}" ${i === d.month ? "selected" : ""}>${m}</option>`)
			.join("");
		const w = game.settings.get(SYSTEM_ID, "weather");
		const weather = Object.entries({ normal: "Normal", hot: "Hot (above 32\u00b0C)", cold: "Cold (below 5\u00b0C)" })
			.map(([k, v]) => `<option value="${k}" ${k === w ? "selected" : ""}>${v}</option>`)
			.join("");
		const skip = game.settings.get(SYSTEM_ID, "conditionsSkipMissingPlayers");
		const skipHint = game.settings.settings.get(`${SYSTEM_ID}.conditionsSkipMissingPlayers`)?.hint ?? "";
		const step = (sec, label) =>
			`<button type="button" data-action="advance" data-seconds="${sec}">${label}</button>`;
		return `
			<fieldset class="fallout-time">
				<div class="form-group">
					<label for="fallout-dt-day">Day</label>
					<div class="form-fields"><input type="number" id="fallout-dt-day" name="day" min="1" max="31" step="1" value="${d.day}"></div>
				</div>
				<div class="form-group">
					<label for="fallout-dt-month">Month</label>
					<div class="form-fields"><select id="fallout-dt-month" name="month">${months}</select></div>
				</div>
				<div class="form-group">
					<label for="fallout-dt-year">Year</label>
					<div class="form-fields"><input type="number" id="fallout-dt-year" name="year" min="1" max="9999" step="1" value="${d.year}"></div>
				</div>
				<div class="form-group">
					<label for="fallout-dt-time">Time</label>
					<div class="form-fields"><input type="time" id="fallout-dt-time" name="time" value="${pad(d.hour)}:${pad(d.minute)}" step="60"></div>
				</div>
				<div class="fallout-steps">${step(-3600, "&minus;1 h")}${step(600, "+10 min")}${step(3600, "+1 h")}${step(8 * 3600, "+8 h")}${step(86400, "+1 day")}</div>
			</fieldset>
			<fieldset class="fallout-rate">
				<div class="form-group">
					<label for="fallout-dt-rate">Clock speed</label>
					<div class="form-fields">
						<input type="range" id="fallout-dt-slider" min="0" max="1000" step="1" value="${rateToSlider(rate)}" aria-label="Clock speed">
						<input type="number" id="fallout-dt-rate" name="timeRate" min="1" max="${MAX_RATE}" step="1" value="${rate}">
					</div>
					<p class="hint fallout-rate-hint">${rateHint(rate)}</p>
				</div>
				<p class="hint">Runs while unpaused; stops in combat.</p>
			</fieldset>
			<fieldset class="fallout-weather">
				<div class="form-group">
					<label for="fallout-dt-weather">Weather</label>
					<div class="form-fields"><select id="fallout-dt-weather" name="weather">${weather}</select></div>
					<p class="hint">Hot: thirst twice as fast. Cold: hunger twice as fast.</p>
				</div>
			</fieldset>
			<fieldset class="fallout-conditions">
				<div class="form-group">
					<label for="fallout-dt-skip">Conditions Skip Missing Players</label>
					<div class="form-fields"><input type="checkbox" id="fallout-dt-skip" name="conditionsSkipMissingPlayers" ${skip ? "checked" : ""}></div>
					<p class="hint">${skipHint}</p>
				</div>
			</fieldset>`;
	}

	_replaceHTML(result, content) {
		content.innerHTML = result;
	}

	_onRender(context, options) {
		super._onRender(context, options);
		// the slider is logarithmic and only shows the speed; the number box holds it (and saves it)
		const slider = this.element.querySelector("#fallout-dt-slider");
		const box = this.element.querySelector("#fallout-dt-rate");
		const hint = this.element.querySelector(".fallout-rate-hint");
		slider.addEventListener("input", () => {
			box.value = sliderToRate(slider.value);
			hint.textContent = rateHint(Number(box.value));
		});
		slider.addEventListener("change", () => box.dispatchEvent(new Event("change", { bubbles: true })));
		box.addEventListener("input", () => {
			const r = clampRate(box.value);
			slider.value = rateToSlider(r);
			hint.textContent = rateHint(r);
		});
	}

	/** Put the current date in the fields, unless the user is typing in one. */
	#showTime() {
		const box = this.element?.querySelector(".fallout-time");
		const typing = document.activeElement?.matches?.("input, select");
		if (!box || (typing && box.contains(document.activeElement))) return;
		const d = dateOf();
		box.querySelector("[name=day]").value = d.day;
		box.querySelector("[name=month]").value = d.month;
		box.querySelector("[name=year]").value = d.year;
		box.querySelector("[name=time]").value = `${pad(d.hour)}:${pad(d.minute)}`;
	}

	static async #onSubmit(event, form, formData) {
		if (!game.user.isGM) return;
		const { day, month, year, time, timeRate, weather } = formData.object;

		for (const key of FalloutDateTime.TOGGLES) {
			const value = !!formData.object[key];
			if (value !== game.settings.get(SYSTEM_ID, key)) await game.settings.set(SYSTEM_ID, key, value);
		}

		if (weather && (weather !== game.settings.get(SYSTEM_ID, "weather"))) {
			await game.settings.set(SYSTEM_ID, "weather", weather);
		}

		if ((timeRate !== undefined) && (timeRate !== null) && (timeRate !== "")) {
			const rate = clampRate(timeRate);
			// whole numbers only: show what was kept
			const box = form.querySelector("[name=timeRate]");
			if (box && (box.value !== String(rate))) box.value = rate;
			form.querySelector("#fallout-dt-slider").value = rateToSlider(rate);
			form.querySelector(".fallout-rate-hint").textContent = rateHint(rate);
			if (rate !== game.settings.get(SYSTEM_ID, "timeRate")) {
				await game.settings.set(SYSTEM_ID, "timeRate", rate);
			}
		}

		// the date: only when one of its fields changed
		if (!event?.target?.closest?.(".fallout-time")) return;
		const [hour, minute] = String(time || "0:0").split(":").map(Number);
		const y = Math.round(Number(year));
		const m = Number(month);
		if (!Number.isFinite(y) || !Number.isFinite(m)) return;
		const dd = Math.max(1, Math.min(monthDays(y, m), Math.round(Number(day)) || 1));
		const t = timeOf({ year: y, month: m, day: dd, hour: hour || 0, minute: minute || 0 });
		if (t !== game.time.worldTime) await game.time.set(t);
	}

	static async #onAdvance(event, target) {
		await game.time.advance(Number(target.dataset.seconds));
	}
}

/** Value limits of the roll panel's counters. */
const LIMITS = {
	attribute: [0, 9],
	skill: [0, 9],
	complication: [1, 20],
};

/** Highest number of d20s the panel offers. */
const MAX_DICE = 6;

/** Van Buren interface click (IB1P1XX1) for every key on the roll panel. */
const BUTTON_SOUND = "systems/fallout/assets/sounds/classic/ib1p1xx1.ogg";

/** Van Buren refusal (IISXXXX1) when a counter is pushed past its limit. */
const LIMIT_SOUND = "systems/fallout/assets/sounds/classic/iisxxxx1.ogg";

function playSound(src) {
	foundry.audio.AudioHelper.play({ src, volume: 0.8, loop: false, channel: "interface" }, false);
}

export class Dialog2d20 extends Dialog {

	constructor(
		rollName,
		diceNum,
		attribute,
		skill,
		tag,
		complication,
		rollLocation,
		actor,
		item,
		dialogData={},
		options={}
	) {
		super(dialogData, options);
		this.rollName = rollName;
		this.diceNum = diceNum;
		this.attribute = attribute;
		this.skill = skill;
		this.tag = tag;
		this.complication = complication;
		this.rollLocation = rollLocation;
		this.actor = actor;
		this.item = item;
		this.options.classes = ["dice-icon", "forkout-roller-app"];
		this.deferred = new Deferred();
	}

	activateListeners(html) {
		super.activateListeners(html);

		html.ready(e => {
			this.markDiceNumber(html, this.diceNum);
		});

		html.on("click", ".dice-icon", (e, i, a) => {
			let index = e.currentTarget.dataset.index;
			this.diceNum = parseInt(index);
			this.markDiceNumber(html, this.diceNum);
		});
		this.data.buttons.roll.callback=this.rollButton.bind(this);

		this.#buildDials(html);

		// every key on the panel clicks as it goes down; a counter key that
		// would go past the counter's limit sounds the refusal instead
		html.on("pointerdown", ".fr-panel > a", e => {
			if (e.button !== 0) {
				return;
			}
			const { field, delta } = e.currentTarget.dataset;
			playSound(field && this.#atLimit(html, field, Number(delta)) ? LIMIT_SOUND : BUTTON_SOUND);
		});

		// plus / minus keys, and the mouse wheel over a dial
		html.on("click", ".fr-key", e => {
			const { field, delta } = e.currentTarget.dataset;
			this.#step(html, field, Number(delta));
		});
		html.on("wheel", ".fr-dial", e => {
			e.preventDefault();
			const dy = e.originalEvent?.deltaY ?? 0;
			if (dy) {
				const field = e.currentTarget.dataset.field;
				const delta = dy < 0 ? 1 : -1;
				if (this.#atLimit(html, field, delta)) {
					// once per spin of the wheel, not once per wheel tick
					const now = Date.now();
					if (now - (this._limitSoundAt ?? 0) > 400) {
						playSound(LIMIT_SOUND);
					}
					this._limitSoundAt = now;
					return;
				}
				this.#step(html, field, delta);
			}
		});

		html.on("click", ".fr-tag", e => {
			const box = html.find('[name="tag"]');
			box.prop("checked", !box.is(":checked"));
			$(e.currentTarget).toggleClass("lit", box.is(":checked"));
		});

		html.on("click", ".fr-roll", () => {
			this.element.find('.dialog-button[data-button="roll"]').trigger("click");
		});
	}

	/* ------------------------- rotary counters ------------------------- */

	/** The digits a dial shows: one cell per value it can stand on. */
	static #cells(place) {
		if (place === "units") {
			// 9 above 0 and 0 below 9, so the drum can roll round
			return [9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
		}
		if (place === "tens") {
			return [0, 1, 2];
		}
		return null; // whole number: filled by #buildDials from the limits
	}

	/** Which cell a dial stands on for a field value. */
	static #cellIndex(place, value) {
		if (place === "units") {
			return (value % 10) + 1;
		}
		if (place === "tens") {
			return Math.floor(value / 10);
		}
		return value;
	}

	#buildDials(html) {
		html.find(".fr-dial").each((i, dial) => {
			const { field, place } = dial.dataset;
			let cells = Dialog2d20.#cells(place);
			if (!cells) {
				const [, max] = LIMITS[field];
				cells = Array.from({ length: max + 1 }, (v, n) => n);
			}
			const strip = document.createElement("div");
			strip.className = "fr-strip";
			strip.innerHTML = cells
				.map(n => `<span class="${n >= 10 ? "two" : ""}">${n}</span>`)
				.join("");
			dial.append(strip);
			strip.addEventListener("transitionend", () => this.#settle(dial));
			// the counters can't show more than their limits: roll what they show
			const value = this.#value(html, field);
			html.find(`[name="${field}"]`).val(value);
			this.#place(dial, Dialog2d20.#cellIndex(place, value), false);
		});
	}

	/** Would this step take the counter past its limit? */
	#atLimit(html, field, delta) {
		const [min, max] = LIMITS[field];
		const next = this.#value(html, field) + delta;
		return (next < min) || (next > max);
	}

	#value(html, field) {
		const [min, max] = LIMITS[field];
		const v = Math.round(Number(html.find(`[name="${field}"]`).val()));
		return Math.max(min, Math.min(max, Number.isFinite(v) ? v : min));
	}

	/** Roll a dial to a cell (animated or not). */
	#place(dial, index, animate) {
		const strip = dial.querySelector(".fr-strip");
		const cell = strip.firstElementChild?.offsetHeight || 150;
		const offset = ((dial.offsetHeight || 197) - cell) / 2 - (index * cell);
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
		if (index === 0 || index === 11) {
			this.#place(dial, index === 0 ? 10 : 1, false);
			void dial.offsetHeight; // apply before the next move
		}
	}

	#step(html, field, delta) {
		const [min, max] = LIMITS[field];
		const old = this.#value(html, field);
		const value = Math.max(min, Math.min(max, old + delta));
		if (value === old) {
			return;
		}
		html.find(`[name="${field}"]`).val(value);
		html.find(`.fr-dial[data-field="${field}"]`).each((i, dial) => {
			const place = dial.dataset.place;
			this.#settle(dial);
			let index = Dialog2d20.#cellIndex(place, value);
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

	rollButton() {
		let attr = this.element.find('[name="attribute"]').val();
		let skill = this.element.find('[name="skill"]').val();
		let complication = this.element.find('[name="complication"]').val();
		let isTag = this.element.find('[name="tag"]').is(":checked");

		this.rolling = true;
		fallout.Roller2D20.rollD20({
			rollname: this.rollName,
			dicenum: this.diceNum,
			attribute: attr,
			skill: skill,
			tag: isTag,
			complication: complication,
			rollLocation: this.rollLocation,
			item: this.item,
			actor: this.actor,
		}).then(result => this.deferred.resolve(result));

		if (this.actor && game.settings.get("fallout", "automaticAmmunitionCalculation")) {
			const actorType = this.actor?.type;
			if (actorType !== "character" && actorType !== "robot" && actorType !== "vehicle") {
				return;
			}

			// REDUCE AMMO
			if (this.item?.system?.ammo !== "") {
				try {
					this.actor.reduceAmmo(
						this.item.system.ammo,
						this.item.system.ammoPerShot
					);
				}
				catch(er) {
					console.warn(er);
				}
			}
			else if (this.item?.system?.consumedOnUse) {
				const newQuantity = parseInt(this.item.system.quantity) - 1;

				this.item.update({
					"system.quantity": newQuantity,
				});
			}
		}
	}

	async close(options={}) {
		super.close(options);
		if (!this.rolling) {
			this.deferred.resolve(null);
		}
	}

	markDiceNumber(html) {
		$(html).find(".dice-icon").removeClass("marked");
		$(html).find(`[data-index="${this.diceNum}"]`).addClass("marked");
	}

	static async createDialog({ rollName = "Roll D20", diceNum = 2, attribute = 0, skill = 0, tag = false, complication = 20, rollLocation=false, actor=null, item=null } = {}) {
		diceNum = Math.max(1, Math.min(MAX_DICE, parseInt(diceNum) || 2));
		let dialogData = {};

		dialogData.rollName = rollName;
		dialogData.diceNum = diceNum;
		dialogData.attribute = attribute;
		dialogData.skill = skill;
		dialogData.tag = tag;
		dialogData.complication = complication;
		dialogData.rollLocation = rollLocation;
		dialogData.actor = actor;
		dialogData.item = item;

		const html = await foundry.applications.handlebars.renderTemplate("systems/fallout/templates/dialogs/dialog2d20.hbs", dialogData);

		let d = new Dialog2d20(
			rollName,
			diceNum,
			attribute,
			skill,
			tag,
			complication,
			rollLocation,
			actor,
			item,
			{
				title: rollName,
				content: html,
				buttons: {
					roll: {
						icon: '<i class="fas fa-check"></i>',
						label: "ROLL",
					},
				},
				default: "roll",
			},
			{ width: 640 }
		);
		d.options.classes.push("themed", "themed-light");

		d.render(true);
		return d.deferred.promise;
	}
}

class Deferred {
	constructor() {
		this.promise = new Promise((resolve, reject) => {
			this.reject = reject;
			this.resolve = resolve;
		});
	}
}

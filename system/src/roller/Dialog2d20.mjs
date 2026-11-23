import { RollerPanel } from "./RollerPanel.mjs";

/** Value limits of the roll panel's counters. */
const LIMITS = {
	attribute: [0, 9],
	skill: [0, 9],
	complication: [1, 20],
};

/** Highest number of d20s the panel offers. */
const MAX_DICE = 6;

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

		new RollerPanel(html, LIMITS).activate();

		html.on("click", ".fr-tag", e => {
			const box = html.find('[name="tag"]');
			box.prop("checked", !box.is(":checked"));
			$(e.currentTarget).toggleClass("lit", box.is(":checked"));
		});

		html.on("click", ".fr-roll", () => {
			this.element.find('.dialog-button[data-button="roll"]').trigger("click");
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

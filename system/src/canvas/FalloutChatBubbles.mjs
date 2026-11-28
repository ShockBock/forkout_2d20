/**
 * Classic speech: a token's in-character chat floats over its head as bare
 * outlined text (JH_FALLOUT), coloured by the token's disposition, centred
 * on the token instead of Foundry's left/right speech bubble.
 *
 * `say` follows Foundry's own (v14) step by step; it is rewritten here only
 * because the bubble's position and display time are private there. Size,
 * height and duration come from the Float Speech game settings.
 */
export default class FalloutChatBubbles extends foundry.canvas.animation.ChatBubbles {

	/** Bundled speech font, loaded before the first bubble is measured. */
	static FONT = "16px \"Forkout Speech\"";

	/** Most recently panned-to token, so a speaker is not panned to twice. */
	_panned = null;

	/** @override */
	async say(token, message, { cssClasses = [], requireVisible = false, pan = true, user } = {}) {
		if (!token || !message) {
			return null;
		}
		if (!game.settings.get("core", "chatBubbles")) {
			return null;
		}
		if (requireVisible && !token.visible) {
			return null;
		}

		await this._clearBubble(token);
		await document.fonts?.load(this.constructor.FONT).catch(() => {});

		const TextEditor = foundry.applications.ux.TextEditor.implementation;
		const actor = ChatMessage.implementation.getSpeakerActor({
			scene: token.scene.id,
			token: token.id,
		});
		message = await TextEditor.enrichHTML(foundry.utils.cleanHTML(message, { user }), {
			rollData: actor?.getRollData(),
			secrets: actor?.isOwner ?? game.user.isGM,
		});
		const rendered = await foundry.applications.handlebars.renderTemplate(this.template, {
			token,
			message,
			cssClasses: cssClasses.join(" "),
		});
		const html = foundry.utils.parseHTML(rendered);
		html.dataset.disposition = this.constructor.dispositionKey(token);

		const options = { cssClasses, requireVisible, pan };
		if (Hooks.call("chatBubbleHTML", token, html, message, options) === false) {
			return false;
		}

		const dimensions = this._measure(message, user);
		this._place(token, html, dimensions);
		this.element.append(html);

		let panPromise;
		const panToSpeaker = game.settings.get("core", "chatBubblesPan")
			&& (options.pan === true) && (this._panned !== token);
		if (panToSpeaker) {
			const scale = Math.max(canvas.dimensions.scale.default, canvas.stage.scale.x);
			panPromise = canvas.animatePan({ ...token.center, scale, duration: 1000 });
			this._panned = token;
		}

		const duration = this.constructor.duration(html);
		const scroll = dimensions.unconstrained - dimensions.height;

		html.style.opacity = 0;
		html.animate({ opacity: [0, 1] }, { duration: 250, easing: "ease" }).finished.then(async () => {
			html.style.opacity = 1;
			await panPromise;
			if (scroll > 0) {
				const inner = html.querySelector(".bubble-content");
				inner.animate(
					{ top: [0, `${-scroll}px`] },
					{ duration: Math.max(duration - 1000, 250), easing: "linear" }
				).finished.then(() => (inner.style.top = `${-scroll}px`));
			}
			setTimeout(() => {
				html.animate({ opacity: [1, 0] }, { duration: 250, easing: "ease" })
					.finished.then(() => html.remove());
			}, duration);
		});

		return html;
	}

	/** Fade out and remove a token's current speech, if any. */
	async _clearBubble(token) {
		const existing = this.element?.querySelector(`.chat-bubble[data-token-id="${token.id}"]`);
		if (!existing) {
			return;
		}
		await existing.animate({ opacity: 0 }, { duration: 100, easing: "ease" }).finished;
		existing.remove();
	}

	/** Size of the text as shown (height capped) and uncapped. */
	_measure(message, user) {
		const div = document.createElement("div");
		div.classList.add("chat-bubble");
		div.style.visibility = "hidden";
		div.innerHTML = foundry.utils.cleanHTML(message, { user });
		document.body.append(div);
		const dims = {
			width: div.clientWidth + (8 * canvas.dimensions.uiScale),
			height: div.clientHeight,
		};
		div.style.maxHeight = "none";
		dims.unconstrained = div.clientHeight;
		div.remove();
		return dims;
	}

	/** Centred over the token, Height Above Token clear of its top. */
	_place(token, html, { width, height }) {
		const gap = game.settings.get(SYSTEM_ID, "floatSpeechHeight");
		html.style.width = `${width}px`;
		html.style.height = `${height}px`;
		html.style.left = `${token.x + (token.w / 2) - (width / 2)}px`;
		html.style.top = `${token.y - height - gap}px`;
	}

	/**
	 * Display time (ms): the Duration setting, or at its lowest (0) Foundry's
	 * reading-speed time, 300 words a minute, 1-20 s.
	 */
	static duration(html) {
		const seconds = game.settings.get(SYSTEM_ID, "floatSpeechDuration");
		if (seconds > 0) {
			return seconds * 1000;
		}
		const words = html.textContent?.split(/\s+/).filter(w => w.trim().length).length ?? 0;
		return Math.clamp((words * 60 * 1000) / 300, 1000, 20000);
	}

	/** "friendly", "neutral", "hostile" or "secret" for a token. */
	static dispositionKey(token) {
		const d = token.document?.disposition ?? CONST.TOKEN_DISPOSITIONS.NEUTRAL;
		const key = Object.entries(CONST.TOKEN_DISPOSITIONS).find(([, v]) => v === d)?.[0];
		return (key ?? "NEUTRAL").toLowerCase();
	}
}

/** Classic pause screen: a looping video (with alpha) instead of the bar. */
const PAUSE_VIDEO = "systems/fallout/assets/ui/paused_classic.webm";

export const renderGamePauseHook = {
	attach: () => {
		fallout.debug("Attaching renderGamePause hook");

		Hooks.on("renderGamePause", (app, element) => {
			element.classList.add("classic-pause");

			const caption = element.querySelector("figcaption");
			const video = document.createElement("video");
			video.src = PAUSE_VIDEO;
			video.autoplay = true;
			video.loop = true;
			video.muted = true;
			video.playsInline = true;
			video.setAttribute("aria-hidden", "true");

			element.replaceChildren(video, ...(caption ? [caption] : []));
			if (game.paused) {
				video.play().catch(() => {});
			}
		});
	},
};

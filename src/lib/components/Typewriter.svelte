<script>
	import { browser } from '$app/environment';

	let { text, speed = 40, delay = 0 } = $props();

	const SESSION_KEY = 'typewriter_done';
	const skipAnimation = browser && sessionStorage.getItem(SESSION_KEY);

	let displayed = $state('');
	let typing = $state(false);

	$effect(() => {
		if (!text) {
			displayed = '';
			typing = false;
			return;
		}

		if (skipAnimation) {
			displayed = text;
			typing = false;
			return;
		}

		displayed = '';
		typing = true;
		let i = 0;
		const target = text;
		let timeout;

		function typeNext() {
			if (i < target.length) {
				displayed = target.slice(0, i + 1);
				i++;
				timeout = setTimeout(typeNext, speed);
			} else {
				typing = false;
				if (browser) sessionStorage.setItem(SESSION_KEY, '1');
			}
		}

		timeout = setTimeout(typeNext, delay);
		return () => clearTimeout(timeout);
	});
</script>

<span>{displayed}{#if typing}<span class="animate-blink">|</span>{/if}</span>

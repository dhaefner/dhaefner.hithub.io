document.addEventListener('DOMContentLoaded', function () {
    const menuToggle = document.getElementById('menuToggle');
    const sideMenu = document.getElementById('sideMenu');
    const closeMenu = document.getElementById('closeMenu');
    const backdrop = document.getElementById('menuBackdrop');
    const BREAKPOINT = 900; // in px, anpassen je nach CSS

    function openMenu() {
        sideMenu.classList.add('open');
        backdrop.classList.add('visible');
        backdrop.hidden = false;
        sideMenu.setAttribute('aria-hidden', 'false');
        // Fokus für A11y
        closeMenu?.focus();
    }
    function closeMenuFn() {
        sideMenu.classList.remove('open');
        backdrop.classList.remove('visible');
        // nach Übergang ausblenden, damit pointer-events none greift
        setTimeout(() => { backdrop.hidden = true; }, 300);
        sideMenu.setAttribute('aria-hidden', 'true');
        menuToggle?.focus();
    }

    menuToggle?.addEventListener('click', openMenu);
    closeMenu?.addEventListener('click', closeMenuFn);
    backdrop?.addEventListener('click', closeMenuFn);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sideMenu.classList.contains('open')) closeMenuFn();
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth > BREAKPOINT && sideMenu.classList.contains('open')) {
            closeMenuFn();
        }
    });
});
const tutorialTocShell = document.querySelector('.tutorial-toc-shell');
const tutorialToc = tutorialTocShell?.querySelector('[data-tutorial-toc]');
const tutorialTocToggle = tutorialTocShell?.querySelector('[data-tutorial-toc-toggle]');

if (tutorialTocShell instanceof HTMLElement && tutorialToc instanceof HTMLElement) {
  const mobileTocBreakpoint = window.matchMedia('(max-width: 960px)');

  const setTocOpen = (isOpen) => {
    tutorialTocShell.classList.toggle('is-open', isOpen);

    if (tutorialTocToggle instanceof HTMLButtonElement) {
      tutorialTocToggle.setAttribute('aria-expanded', String(isOpen));
    }
  };

  tutorialTocShell.dataset.enhanced = 'true';
  setTocOpen(!mobileTocBreakpoint.matches);

  if (tutorialTocToggle instanceof HTMLButtonElement) {
    tutorialTocToggle.addEventListener('click', () => {
      setTocOpen(!tutorialTocShell.classList.contains('is-open'));
    });

    mobileTocBreakpoint.addEventListener('change', (event) => {
      setTocOpen(!event.matches);
    });
  }

  const tocLinks = Array.from(tutorialToc.querySelectorAll('a[href^="#"]'));
  const tocItems = tocLinks
    .map((link) => {
      const id = decodeURIComponent(link.getAttribute('href')?.slice(1) ?? '');
      const heading = id.length === 0 ? null : document.getElementById(id);

      if (!(heading instanceof HTMLElement)) {
        return null;
      }

      return { heading, link };
    })
    .filter(Boolean);

  if (tocItems.length > 0) {
    let activeId = '';
    let ticking = false;

    const setActiveLink = (id) => {
      if (activeId === id) {
        return;
      }

      activeId = id;

      for (const item of tocItems) {
        const isActive = item.heading.id === id;
        item.link.classList.toggle('is-active', isActive);

        if (isActive) {
          item.link.setAttribute('aria-current', 'location');
        } else {
          item.link.removeAttribute('aria-current');
        }
      }
    };

    const updateActiveLink = () => {
      ticking = false;

      let nextActiveId = tocItems[0].heading.id;

      for (const item of tocItems) {
        if (item.heading.getBoundingClientRect().top <= 160) {
          nextActiveId = item.heading.id;
          continue;
        }

        break;
      }

      setActiveLink(nextActiveId);
    };

    const requestUpdate = () => {
      if (ticking) {
        return;
      }

      ticking = true;
      window.requestAnimationFrame(updateActiveLink);
    };

    updateActiveLink();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);

    for (const item of tocItems) {
      item.link.addEventListener('click', () => {
        if (mobileTocBreakpoint.matches) {
          setTocOpen(false);
        }
      });
    }
  }
}

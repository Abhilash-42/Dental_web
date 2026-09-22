/* =========================================================
   MOBILE NAV
   ========================================================= */

document
  .getElementById('navToggle')
  .addEventListener(
    'click',
    () => {

      const links =
        document.querySelector(
          'nav.links'
        );


      const isShown =
        links.style.display ===
        'flex';


      links.style.display =
        isShown
          ? 'none'
          : 'flex';


      links.style.flexDirection =
        'column';

      links.style.position =
        'absolute';

      links.style.top =
        '64px';

      links.style.left =
        '0';

      links.style.right =
        '0';

      links.style.background =
        'var(--ivory)';

      links.style.padding =
        '20px 28px';

      links.style.borderBottom =
        '1px solid var(--line)';

      links.style.gap =
        '18px';

    }
  );


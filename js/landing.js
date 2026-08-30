/**
 * SUCCESS ACADEMY — Landing Page JavaScript
 * Handles: Navigation, Scroll animations, Mobile menu, Portal dropdown, Form
 */

(function () {
  'use strict';

  /* ─────────────────────────────────────────
     NAV — Glassmorphic scroll state
  ───────────────────────────────────────── */
  const nav = document.getElementById('main-nav');
  const scrollThreshold = 48;

  function updateNav() {
    if (window.scrollY > scrollThreshold) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
  }

  window.addEventListener('scroll', updateNav, { passive: true });
  updateNav();

  /* ─────────────────────────────────────────
     MOBILE MENU
  ───────────────────────────────────────── */
  const menuToggle = document.getElementById('menu-toggle');
  const mobileMenu = document.getElementById('mobile-menu');
  const mobileClose = document.getElementById('mobile-close');
  const mobileLinks = mobileMenu ? mobileMenu.querySelectorAll('a') : [];

  function openMenu() {
    mobileMenu.classList.add('open');
    document.body.style.overflow = 'hidden';
    menuToggle.setAttribute('aria-expanded', 'true');
  }

  function closeMenu() {
    mobileMenu.classList.remove('open');
    document.body.style.overflow = '';
    menuToggle.setAttribute('aria-expanded', 'false');
  }

  if (menuToggle) menuToggle.addEventListener('click', openMenu);
  if (mobileClose) mobileClose.addEventListener('click', closeMenu);
  mobileLinks.forEach(link => link.addEventListener('click', closeMenu));

  /* ─────────────────────────────────────────
     PORTAL DROPDOWN
  ───────────────────────────────────────── */
  const portalWrapper = document.getElementById('portal-wrapper');
  const portalToggle = document.getElementById('portal-toggle');
  const portalDropdown = document.getElementById('portal-dropdown');

  if (portalToggle && portalDropdown) {
    portalToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = portalDropdown.classList.contains('open');
      if (isOpen) {
        closePortal();
      } else {
        openPortal();
      }
    });

    document.addEventListener('click', (e) => {
      if (portalWrapper && !portalWrapper.contains(e.target)) {
        closePortal();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePortal();
    });
  }

  function openPortal() {
    portalDropdown.classList.add('open');
    portalToggle.setAttribute('aria-expanded', 'true');
  }

  function closePortal() {
    if (portalDropdown) portalDropdown.classList.remove('open');
    if (portalToggle) portalToggle.setAttribute('aria-expanded', 'false');
  }

  /* ─────────────────────────────────────────
     SMOOTH SCROLL for anchor links
  ───────────────────────────────────────── */
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (href === '#') return;
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      const navH = nav ? nav.offsetHeight : 0;
      const top = target.getBoundingClientRect().top + window.scrollY - navH - 8;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });

  /* ─────────────────────────────────────────
     ACTIVE NAV LINK — Intersection Observer
  ───────────────────────────────────────── */
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-links a[href^="#"]');

  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        navLinks.forEach(link => {
          link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
        });
      }
    });
  }, { rootMargin: '-40% 0px -55% 0px' });

  sections.forEach(s => sectionObserver.observe(s));

  /* ─────────────────────────────────────────
     SCROLL ANIMATIONS — Intersection Observer
  ───────────────────────────────────────── */
  const animObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        // Only animate once
        animObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.12,
    rootMargin: '0px 0px -40px 0px'
  });

  document.querySelectorAll('[data-animate]').forEach((el, i) => {
    // Stagger delay for grid children
    const delay = el.dataset.delay || 0;
    el.style.transitionDelay = `${delay}ms`;
    animObserver.observe(el);
  });

  /* ─────────────────────────────────────────
     PROGRAMS TABS
  ───────────────────────────────────────── */
  const tabBtns = document.querySelectorAll('.program-tab-btn');
  const tabPanels = document.querySelectorAll('.program-tab-panel');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${target}`)?.classList.add('active');
    });
  });

  /* ─────────────────────────────────────────
     TESTIMONIAL CAROUSEL (mobile)
  ───────────────────────────────────────── */
  const track = document.getElementById('testimonial-track');
  const dots = document.querySelectorAll('.testimonial-dot');
  let currentSlide = 0;
  let autoplayTimer;

  function goToSlide(index) {
    if (!track) return;
    const cards = track.querySelectorAll('.testimonial-card');
    currentSlide = ((index % cards.length) + cards.length) % cards.length;
    track.style.transform = `translateX(-${currentSlide * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle('active', i === currentSlide));
  }

  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => {
      clearInterval(autoplayTimer);
      goToSlide(i);
    });
  });

  function startAutoplay() {
    autoplayTimer = setInterval(() => goToSlide(currentSlide + 1), 5000);
  }

  if (track && dots.length) {
    startAutoplay();
    track.addEventListener('touchstart', () => clearInterval(autoplayTimer), { passive: true });
    track.addEventListener('touchend', startAutoplay, { passive: true });
  }

  /* ─────────────────────────────────────────
     ENQUIRY FORM
  ───────────────────────────────────────── */
  const form = document.getElementById('enquiry-form');
  const formWrap = document.getElementById('form-wrap');
  const successState = document.getElementById('form-success');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      let valid = true;

      // Validate all required fields
      form.querySelectorAll('[required]').forEach(field => {
        const wrapper = field.closest('.field');
        if (!wrapper) return;
        const error = wrapper.querySelector('.field-error');
        if (!field.value.trim()) {
          wrapper.classList.add('has-error');
          valid = false;
        } else {
          wrapper.classList.remove('has-error');
        }
      });

      // Phone validation
      const phone = document.getElementById('f-phone');
      if (phone) {
        const phoneWrapper = phone.closest('.field');
        if (!/^[6-9]\d{9}$/.test(phone.value.trim())) {
          phoneWrapper?.classList.add('has-error');
          valid = false;
        }
      }

      if (!valid) return;

      // Simulate submission
      const submitBtn = form.querySelector('[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';

      await new Promise(r => setTimeout(r, 800));

      if (formWrap && successState) {
        formWrap.style.display = 'none';
        successState.classList.add('active');
      }
    });

    // Live clear error on input
    form.querySelectorAll('input, select, textarea').forEach(field => {
      field.addEventListener('input', () => {
        field.closest('.field')?.classList.remove('has-error');
      });
    });
  }

  /* ─────────────────────────────────────────
     HERO COUNTER ANIMATION
  ───────────────────────────────────────── */
  function animateNumber(el, target, duration = 1500) {
    let start = null;
    const startVal = 0;

    function step(timestamp) {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.floor(startVal + (target - startVal) * ease);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  const counters = document.querySelectorAll('[data-count]');
  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const target = parseInt(entry.target.dataset.count);
        animateNumber(entry.target, target);
        counterObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  counters.forEach(c => counterObserver.observe(c));

})();

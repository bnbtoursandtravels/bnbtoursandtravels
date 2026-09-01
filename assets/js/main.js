/* ==========================================================================
   B&B Tours and Travel — site behaviour
   1. Config
   2. Header & navigation
   3. Scroll reveal
   4. Active section highlighting
   5. Booking form -> WhatsApp
   6. Lazy Google Map
   7. Live Google reviews (Places API New)
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------------------------------------------- 1. Config ------- */
  var CONFIG = {
    // WhatsApp number in international format, digits only, no "+" and no spaces.
    whatsappNumber: '919895451666',

    // Google Places API (New). Both values are required for live reviews.
    //  - placeId : find it at developers.google.com/maps/documentation/places/web-service/place-id
    //  - apiKey  : Google Cloud key with "Places API (New)" enabled.
    //              Restrict it by HTTP referrer to your own domain, and restrict
    //              it to the Places API only — this key is visible to visitors.
    googlePlaceId: 'ChIJR0c9VjhZpjsRq-wyykEGFTI',
    googleApiKey: 'GOOGLE_MAPS_API_KEY',

    // How long to keep reviews in localStorage before refetching (hours).
    reviewsCacheHours: 24,

    // Only show reviews at or above this star rating.
    reviewsMinRating: 4
  };

  var isConfigured = function (value, placeholder) {
    return typeof value === 'string' && value && value.indexOf(placeholder) === -1;
  };

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  /* ------------------------------------------- 2. Header & navigation --- */
  var header = $('#site-header');
  var nav = $('#site-nav');
  var toggle = $('#nav-toggle');

  if (header) {
    var setStuck = function () {
      // the masthead sits transparent over the hero and solidifies on scroll
      header.classList.toggle('is-stuck', window.scrollY > 40);
    };
    setStuck();
    window.addEventListener('scroll', setStuck, { passive: true });
  }

  if (nav && toggle) {
    var closeNav = function (returnFocus) {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open navigation menu');
      document.body.classList.remove('nav-open');
      if (returnFocus) { toggle.focus(); }
    };

    var openNav = function () {
      nav.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close navigation menu');
      document.body.classList.add('nav-open');
    };

    toggle.addEventListener('click', function () {
      if (nav.classList.contains('is-open')) { closeNav(false); } else { openNav(); }
    });

    // close on link activation, Escape, outside click, and when the drawer
    // breakpoint is passed
    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) { closeNav(false); }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && nav.classList.contains('is-open')) { closeNav(true); }
    });

    document.addEventListener('click', function (event) {
      if (!nav.classList.contains('is-open')) { return; }
      if (!nav.contains(event.target) && !toggle.contains(event.target)) { closeNav(false); }
    });

    // keep focus inside the open drawer
    nav.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab' || !nav.classList.contains('is-open')) { return; }
      var items = $$('a', nav);
      if (!items.length) { return; }
      var first = items[0];
      var last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        toggle.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        toggle.focus();
      }
    });

    if (window.matchMedia) {
      var desktop = window.matchMedia('(min-width: 1024px)');
      var onBreakpoint = function (event) { if (event.matches) { closeNav(false); } };
      if (desktop.addEventListener) { desktop.addEventListener('change', onBreakpoint); }
      else if (desktop.addListener) { desktop.addListener(onBreakpoint); }
    }
  }

  /* ---------------------------------------------- 3. Scroll reveal ------ */
  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var revealables = $$('.reveal');

  if (!revealables.length) {
    /* nothing to do */
  } else if (reduceMotion || !('IntersectionObserver' in window)) {
    // show everything at once, and drop the class so it cannot interfere with
    // component hover styles
    revealables.forEach(function (el) { el.classList.remove('reveal'); });
  } else {
    var REVEAL_MS = 800;   // keep in step with the .reveal.is-visible transition

    var revealObserver = new IntersectionObserver(function (entries, observer) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) { return; }
        var el = entry.target;
        var siblings = Array.prototype.slice.call(el.parentNode.children);
        var delay = Math.min(siblings.indexOf(el), 5) * 70;
        el.style.transitionDelay = delay + 'ms';
        el.classList.add('is-visible');
        observer.unobserve(el);

        // Once the entrance is done, drop the classes entirely. `.reveal
        // .is-visible` sets `transform: none` at the same specificity as rules
        // like `.car:hover`, and being later in the stylesheet it would win —
        // killing every hover lift on the page. Removing it hands control back
        // to each component's own transition.
        window.setTimeout(function () {
          el.classList.remove('reveal', 'is-visible');
          el.style.transitionDelay = '';
        }, REVEAL_MS + delay + 60);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });

    revealables.forEach(function (el) { revealObserver.observe(el); });
  }

  /* ------------------------------------------ 3c. Fleet carousel ------- */
  var fleet = document.querySelector('.fleet');

  if (fleet) {
    /* Entrance. The cards live in a horizontal scroller, so a per-card
       observer would never fire for the ones parked off to the side — watch
       the row itself and let CSS stagger the children. */
    if (!reduceMotion && 'IntersectionObserver' in window) {
      fleet.classList.add('is-ready');
      var fleetObserver = new IntersectionObserver(function (entries, observer) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) { return; }
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        });
      }, { rootMargin: '0px 0px -10% 0px', threshold: 0.15 });
      fleetObserver.observe(fleet);
    }

    /* Progress rail — also the affordance that says the row scrolls, which a
       pointer user would otherwise have to discover by accident. */
    var rail = document.getElementById('fleet-rail');
    var bar = rail && rail.querySelector('.fleet__rail-bar');

    if (bar) {
      var ticking = false;

      var drawRail = function () {
        var span = fleet.scrollWidth - fleet.clientWidth;

        if (span < 4) {                     // everything already fits
          rail.hidden = true;
          return;
        }
        rail.hidden = false;

        var railW = rail.clientWidth;
        var thumbW = Math.max(48, railW * (fleet.clientWidth / fleet.scrollWidth));
        var progress = Math.min(1, Math.max(0, fleet.scrollLeft / span));
        bar.style.width = thumbW + 'px';
        bar.style.transform = 'translateX(' + ((railW - thumbW) * progress) + 'px)';
      };

      var onScroll = function () {
        if (ticking) { return; }
        ticking = true;
        window.requestAnimationFrame(function () { drawRail(); ticking = false; });
      };

      fleet.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', drawRail);
      if ('ResizeObserver' in window) { new ResizeObserver(drawRail).observe(fleet); }
      drawRail();
    }
  }

  /* ------------------------------------------ 3b. Stat count-up -------- */
  var counters = $$('[data-count]');
  if (counters.length && !reduceMotion && 'IntersectionObserver' in window) {
    var countObserver = new IntersectionObserver(function (entries, observer) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) { return; }
        observer.unobserve(entry.target);

        var el = entry.target;
        var target = parseInt(el.getAttribute('data-count'), 10);
        if (!target) { return; }

        var duration = 1100;
        var started = null;

        var tick = function (now) {
          if (started === null) { started = now; }
          var progress = Math.min((now - started) / duration, 1);
          // ease-out cubic, so it decelerates into the final number
          var eased = 1 - Math.pow(1 - progress, 3);
          el.textContent = String(Math.round(target * eased));
          if (progress < 1) { requestAnimationFrame(tick); }
        };

        el.textContent = '0';
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.6 });

    counters.forEach(function (el) { countObserver.observe(el); });
  }

  /* ------------------------------------------ 3c. Hero parallax -------- */
  var heroMedia = $('.hero__media');
  if (heroMedia && !reduceMotion && window.matchMedia('(min-width: 768px)').matches) {
    var latest = 0;
    var queued = false;

    var paint = function () {
      queued = false;
      // small, transform-only shift — never triggers layout
      heroMedia.style.transform = 'translate3d(0,' + (latest * 0.18).toFixed(1) + 'px,0)';
    };

    window.addEventListener('scroll', function () {
      latest = window.scrollY;
      if (latest > window.innerHeight * 1.2) { return; }
      if (!queued) { queued = true; requestAnimationFrame(paint); }
    }, { passive: true });
  }

  /* -------------------------------------- 4. Active section highlight --- */
  var navLinks = $$('.nav__list a');
  if (navLinks.length && 'IntersectionObserver' in window) {
    var linkFor = {};
    var sections = [];

    navLinks.forEach(function (link) {
      var id = link.getAttribute('href');
      if (!id || id.charAt(0) !== '#') { return; }
      var section = document.getElementById(id.slice(1));
      if (!section) { return; }
      linkFor[section.id] = link;
      sections.push(section);
    });

    var sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var link = linkFor[entry.target.id];
        if (!link) { return; }
        if (entry.isIntersecting) {
          navLinks.forEach(function (other) { other.classList.remove('is-active'); });
          link.classList.add('is-active');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

    sections.forEach(function (section) { sectionObserver.observe(section); });
  }

  /* ------------------------------------- 5. Booking form -> WhatsApp ---- */
  var form = $('#booking-form');
  var formError = $('#booking-error');

  if (form) {
    var showError = function (message, field) {
      if (formError) {
        formError.textContent = message;
        formError.hidden = false;
      }
      if (field) {
        field.setAttribute('aria-invalid', 'true');
        field.focus();
      }
    };

    var clearError = function () {
      if (formError) {
        formError.hidden = true;
        formError.textContent = '';
      }
      $$('[aria-invalid]', form).forEach(function (el) { el.removeAttribute('aria-invalid'); });
    };

    var readableDate = function (value) {
      if (!value) { return ''; }
      var parts = value.split('-');
      if (parts.length !== 3) { return value; }
      return parts[2] + '/' + parts[1] + '/' + parts[0];
    };

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      clearError();

      var required = [
        { id: '#bf-name', label: 'your name' },
        { id: '#bf-phone', label: 'your phone number' },
        { id: '#bf-from', label: 'the pickup location' },
        { id: '#bf-to', label: 'the drop location' }
      ];

      for (var i = 0; i < required.length; i++) {
        var field = $(required[i].id);
        if (field && !field.value.trim()) {
          showError('Please enter ' + required[i].label + '.', field);
          return;
        }
      }

      var phone = $('#bf-phone');
      if (phone && phone.value.replace(/\D/g, '').length < 8) {
        showError('Please enter a valid phone number so we can call you back.', phone);
        return;
      }

      if (!isConfigured(CONFIG.whatsappNumber, 'X')) {
        showError('Online booking is not configured yet — please call us instead.');
        return;
      }

      var lines = [
        'Hello B&B Tours and Travel, I would like to book a taxi.',
        '',
        'Name: ' + $('#bf-name').value.trim(),
        'Phone: ' + phone.value.trim(),
        'Pickup: ' + $('#bf-from').value.trim(),
        'Drop: ' + $('#bf-to').value.trim()
      ];

      var date = readableDate($('#bf-date').value);
      if (date) { lines.push('Date: ' + date); }

      window.open(
        'https://wa.me/' + CONFIG.whatsappNumber + '?text=' + encodeURIComponent(lines.join('\n')),
        '_blank',
        'noopener'
      );
    });

    form.addEventListener('input', function (event) {
      if (event.target.getAttribute('aria-invalid')) { clearError(); }
    });
  }

  /* -------------------------------------------- 6. Lazy Google Map ------ */
  var mapWrap = $('#map-embed');

  if (mapWrap && mapWrap.getAttribute('data-map-src')) {
    var mapLoaded = false;

    var loadMap = function () {
      if (mapLoaded) { return; }
      mapLoaded = true;

      var frame = document.createElement('iframe');
      frame.src = mapWrap.getAttribute('data-map-src');
      frame.title = 'Google map showing the B&B Tours and Travel service area';
      frame.loading = 'lazy';
      frame.referrerPolicy = 'no-referrer-when-downgrade';
      frame.setAttribute('allowfullscreen', '');
      mapWrap.textContent = '';
      mapWrap.appendChild(frame);
    };

    // Loads on its own, but only once the map is nearly on screen — a visitor
    // who never scrolls that far never hits Google at all.
    if ('IntersectionObserver' in window) {
      var mapObserver = new IntersectionObserver(function (entries, observer) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) { return; }
          loadMap();
          observer.disconnect();
        });
      }, { rootMargin: '400px 0px' });
      mapObserver.observe(mapWrap);
    } else {
      loadMap();
    }
  }

  /* --------------------------------------------- 7. Google reviews ------ */
  var reviewsSection = $('[data-reviews]');
  var reviewsList = $('#reviews-list');
  var reviewsStatus = $('#reviews-status');
  var reviewsSummary = $('#reviews-summary');
  var reviewsLink = $('#reviews-link');

  var hideReviews = function () {
    if (!reviewsSection) { return; }
    reviewsSection.hidden = true;
    // drop the menu entries too, so nothing links to a hidden section
    $$('a[href="#reviews"]').forEach(function (link) {
      var item = link.closest('li');
      (item || link).hidden = true;
    });
  };

  var starsFor = function (rating) {
    var wrap = document.createElement('div');
    wrap.className = 'review__stars';
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', rating + ' out of 5 stars');
    for (var i = 0; i < 5; i++) {
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M12 17.3l-6.2 3.7 1.7-7L2 9.2l7.1-.6L12 2l2.9 6.6 7.1.6-5.5 4.8 1.7 7z');
      path.setAttribute('fill', i < Math.round(rating) ? 'currentColor' : '#d9d2c3');
      svg.appendChild(path);
      wrap.appendChild(svg);
    }
    return wrap;
  };

  var renderReview = function (review) {
    var item = document.createElement('li');
    item.className = 'review';

    item.appendChild(starsFor(review.rating || 5));

    var text = document.createElement('p');
    text.className = 'review__text';
    // textContent, never innerHTML — review copy is third-party input
    text.textContent = review.text;
    item.appendChild(text);

    var meta = document.createElement('div');
    meta.className = 'review__meta';

    var avatar = document.createElement('span');
    avatar.className = 'review__avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = (review.author || '?').trim().charAt(0).toUpperCase();
    meta.appendChild(avatar);

    var who = document.createElement('div');
    var name = document.createElement('p');
    name.className = 'review__name';
    name.textContent = review.author;
    who.appendChild(name);

    if (review.when) {
      var when = document.createElement('p');
      when.className = 'review__date';
      when.textContent = review.when;
      who.appendChild(when);
    }

    meta.appendChild(who);
    item.appendChild(meta);
    return item;
  };

  var renderReviews = function (data) {
    if (!reviewsList || !data.reviews.length) { hideReviews(); return; }

    data.reviews.forEach(function (review) {
      reviewsList.appendChild(renderReview(review));
    });

    reviewsList.hidden = false;
    if (reviewsStatus) { reviewsStatus.remove(); }

    if (reviewsSummary && data.rating) {
      reviewsSummary.textContent = 'Rated ' + data.rating.toFixed(1) + ' out of 5 by ' +
        data.total + (data.total === 1 ? ' customer' : ' customers') + ' on Google.';
    }

    if (reviewsLink && data.mapsUri) {
      reviewsLink.href = data.mapsUri;
    }
  };

  var normalise = function (payload) {
    var reviews = (payload.reviews || [])
      .filter(function (review) {
        return review.rating >= CONFIG.reviewsMinRating &&
          review.text && review.text.text && review.text.text.trim();
      })
      .map(function (review) {
        return {
          rating: review.rating,
          text: review.text.text.trim(),
          author: (review.authorAttribution && review.authorAttribution.displayName) || 'Google user',
          when: review.relativePublishTimeDescription || ''
        };
      });

    return {
      reviews: reviews,
      rating: payload.rating || 0,
      total: payload.userRatingCount || 0,
      mapsUri: payload.googleMapsUri || ''
    };
  };

  var CACHE_KEY = 'bb-google-reviews-v1';

  var readCache = function () {
    try {
      var raw = window.localStorage.getItem(CACHE_KEY);
      if (!raw) { return null; }
      var cached = JSON.parse(raw);
      var age = Date.now() - cached.at;
      if (age > CONFIG.reviewsCacheHours * 3600 * 1000) { return null; }
      return cached.data;
    } catch (error) {
      return null;
    }
  };

  var writeCache = function (data) {
    try {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: data }));
    } catch (error) { /* storage full or blocked — not fatal */ }
  };

  var loadReviews = function () {
    if (!reviewsSection) { return; }

    if (!isConfigured(CONFIG.googlePlaceId, 'GOOGLE_PLACE_ID') ||
        !isConfigured(CONFIG.googleApiKey, 'GOOGLE_MAPS_API_KEY')) {
      hideReviews();
      return;
    }

    var cached = readCache();
    if (cached) { renderReviews(cached); return; }

    var url = 'https://places.googleapis.com/v1/places/' +
      encodeURIComponent(CONFIG.googlePlaceId) +
      '?languageCode=en&fields=' +
      encodeURIComponent('displayName,rating,userRatingCount,googleMapsUri,reviews') +
      '&key=' + encodeURIComponent(CONFIG.googleApiKey);

    fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(function (response) {
        if (!response.ok) { throw new Error('Places API responded ' + response.status); }
        return response.json();
      })
      .then(function (payload) {
        var data = normalise(payload);
        if (!data.reviews.length) { hideReviews(); return; }
        writeCache(data);
        renderReviews(data);
      })
      .catch(function () {
        // never leave a spinner behind — fall back to the Google profile link
        if (reviewsStatus) {
          reviewsStatus.innerHTML = '';
          var message = document.createElement('p');
          message.className = 'reviews__error';
          message.textContent = 'Our reviews could not be loaded right now — you can read them on Google.';
          reviewsStatus.appendChild(message);
        }
      });
  };

  var reviewsReady = reviewsSection &&
    isConfigured(CONFIG.googlePlaceId, 'GOOGLE_PLACE_ID') &&
    isConfigured(CONFIG.googleApiKey, 'GOOGLE_MAPS_API_KEY');

  // tools/fetch-reviews.mjs bakes reviews straight into the HTML. When that has
  // run, the markup is already there and this script must leave it alone.
  var hasStaticReviews = reviewsSection && reviewsSection.querySelector('.review');

  if (hasStaticReviews) {
    /* nothing to do — the page was built with real reviews in it */
  } else if (reviewsSection && !reviewsReady) {
    // hide the section up front when it is not configured, so no "loading"
    // message is ever shown to a visitor
    hideReviews();
  } else if (reviewsReady && 'IntersectionObserver' in window) {
    // defer the reviews request until the section is close to the viewport
    var reviewsObserver = new IntersectionObserver(function (entries, observer) {
      if (entries[0].isIntersecting) {
        observer.disconnect();
        loadReviews();
      }
    }, { rootMargin: '300px 0px' });
    reviewsObserver.observe(reviewsSection);
  } else if (reviewsReady) {
    loadReviews();
  }

  /* ---------------------------------------------------- misc ------------ */
  var year = $('#year');
  if (year) { year.textContent = String(new Date().getFullYear()); }
})();

(() => {
  const exploreTrailLinks = document.querySelectorAll('a[href="#trail"]');
  const heroEl = document.querySelector('header.hero');
  const trailSectionEl = document.querySelector('#trail');
  const topNavEl = document.querySelector('.top-nav');
  const prefersReducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const navigationEntry = performance.getEntriesByType('navigation')[0];
  const isReloadNavigation = Boolean(navigationEntry && navigationEntry.type === 'reload');

  if (isReloadNavigation) {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }

    if (window.location.hash) {
      history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);
    }

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'auto'
    });
  }

  if (heroEl) {
    if (prefersReducedMotionQuery.matches) {
      heroEl.classList.add('hero-animate-in');
    } else if ('IntersectionObserver' in window) {
      let heroIsVisible = false;
      const triggerHeroAnimation = () => {
        heroEl.classList.remove('hero-animate-in');
        requestAnimationFrame(() => {
          heroEl.classList.add('hero-animate-in');
        });
      };

      const heroObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting && heroIsVisible) {
            heroIsVisible = false;
            heroEl.classList.remove('hero-animate-in');
            return;
          }

          if (entry.isIntersecting && !heroIsVisible) {
            heroIsVisible = true;
            triggerHeroAnimation();
          }
        });
      }, {
        threshold: 0.35
      });

      heroObserver.observe(heroEl);
    } else {
      heroEl.classList.add('hero-animate-in');
    }
  }

  if (exploreTrailLinks.length) {
    exploreTrailLinks.forEach((exploreTrailLink) => {
      exploreTrailLink.addEventListener('click', (event) => {
        event.preventDefault();

        const targetEl = trailSectionEl || heroEl;

        if (!targetEl) {
          return;
        }

        const navOffset = topNavEl ? topNavEl.offsetHeight + 8 : 0;
        const targetTop = Math.max(0, targetEl.offsetTop - navOffset);

        window.scrollTo({
          top: targetTop,
          behavior: prefersReducedMotionQuery.matches ? 'auto' : 'smooth'
        });
      });
    });
  }

  const countdownEls = document.querySelectorAll('[data-countdown]');

  if (countdownEls.length) {
    const pad = (value) => String(value).padStart(2, '0');
    const getServerTimeOffset = async () => {
      try {
        const response = await fetch('/api/current-time', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json();
        const serverNow = Number(payload && payload.now);
        if (!Number.isFinite(serverNow)) {
          throw new Error('Invalid server time payload');
        }

        return serverNow - Date.now();
      } catch {
        return 0;
      }
    };

    getServerTimeOffset().then((serverOffsetMs) => {
      countdownEls.forEach((countdownEl) => {
        const daysEl = countdownEl.querySelector('[data-countdown-value="days"]');
        const hoursEl = countdownEl.querySelector('[data-countdown-value="hours"]');
        const minutesEl = countdownEl.querySelector('[data-countdown-value="minutes"]');
        const secondsEl = countdownEl.querySelector('[data-countdown-value="seconds"]');
        const countdownTarget = countdownEl.getAttribute('data-target-date');
        const targetTime = countdownTarget ? new Date(countdownTarget).getTime() : NaN;

        if (!daysEl || !hoursEl || !minutesEl || !secondsEl || !Number.isFinite(targetTime)) {
          return;
        }

        let countdownIntervalId = null;

        const renderCountdown = () => {
          const trustedNow = Date.now() + serverOffsetMs;
          const remainingTime = targetTime - trustedNow;

          if (remainingTime <= 0) {
            daysEl.textContent = '00';
            hoursEl.textContent = '00';
            minutesEl.textContent = '00';
            secondsEl.textContent = '00';
            countdownEl.setAttribute('data-countdown-ended', 'true');

            if (countdownIntervalId) {
              clearInterval(countdownIntervalId);
            }
            return;
          }

          const days = Math.floor(remainingTime / (1000 * 60 * 60 * 24));
          const hours = Math.floor((remainingTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((remainingTime % (1000 * 60)) / 1000);

          daysEl.textContent = days < 10 ? `0${days}` : String(days);
          hoursEl.textContent = pad(hours);
          minutesEl.textContent = pad(minutes);
          secondsEl.textContent = pad(seconds);
        };

        renderCountdown();
        countdownIntervalId = window.setInterval(renderCountdown, 1000);
      });
    });
  }

  if (topNavEl) {
    const navToggleEl = topNavEl.querySelector('.top-nav-toggle');
    const mobileMenuEl = topNavEl.querySelector('.top-nav-mobile');
    const navLinks = topNavEl.querySelectorAll('a[href^="#"]');

    const closeMobileNav = () => {
      topNavEl.classList.remove('is-open');
      document.body.classList.remove('nav-open');
      if (navToggleEl) {
        navToggleEl.setAttribute('aria-expanded', 'false');
      }
      if (mobileMenuEl) {
        mobileMenuEl.setAttribute('aria-hidden', 'true');
      }
    };

    const openMobileNav = () => {
      topNavEl.classList.add('is-open');
      document.body.classList.add('nav-open');
      if (navToggleEl) {
        navToggleEl.setAttribute('aria-expanded', 'true');
      }
      if (mobileMenuEl) {
        mobileMenuEl.setAttribute('aria-hidden', 'false');
      }
    };

    if (navToggleEl) {
      navToggleEl.addEventListener('click', () => {
        if (topNavEl.classList.contains('is-open')) {
          closeMobileNav();
          return;
        }
        openMobileNav();
      });
    }

    navLinks.forEach((navLink) => {
      navLink.addEventListener('click', () => {
        if (topNavEl.classList.contains('is-open')) {
          closeMobileNav();
        }
      });
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && topNavEl.classList.contains('is-open')) {
        closeMobileNav();
      }
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth >= 768 && topNavEl.classList.contains('is-open')) {
        closeMobileNav();
      }
    });
  }

  const trailGalleryGridEl = document.querySelector('#trailGalleryGrid');
  const trailCarouselEl = document.querySelector('#trailGalleryCarousel');
  const trailCarouselImageEls = document.querySelectorAll('#trailGalleryCarousel .trail-gallery-image');

  if (trailGalleryGridEl && trailCarouselEl && trailCarouselImageEls.length) {
    const galleryFragment = document.createDocumentFragment();

    trailCarouselImageEls.forEach((trailImageEl, index) => {
      const tileEl = document.createElement('div');
      tileEl.className = 'trail-gallery-tile';
      tileEl.setAttribute('role', 'listitem');

      const tileImageEl = document.createElement('img');
      tileImageEl.className = 'trail-gallery-thumb';
      tileImageEl.src = trailImageEl.getAttribute('src') || '';
      tileImageEl.alt = trailImageEl.getAttribute('alt') || `Trail gallery photo ${index + 1}`;
      tileImageEl.loading = 'lazy';
      tileImageEl.decoding = 'async';

      const tileIndexEl = document.createElement('span');
      tileIndexEl.className = 'trail-gallery-tile-index';
      tileIndexEl.textContent = `${index + 1}`;

      // Render non-interactive tiles: no click handlers, plain container
      tileEl.append(tileImageEl, tileIndexEl);

      galleryFragment.appendChild(tileEl);
    });

    trailGalleryGridEl.replaceChildren(galleryFragment);
  }

  const registeredClientsModalEl = document.querySelector('#registeredClientsModal');
  const registeredClientsBodyEl = document.querySelector('#registeredClientsBody');
  const registeredClientsStatusEl = document.querySelector('[data-registered-clients-status]');
  const registeredClientsRefreshEls = document.querySelectorAll('[data-registered-clients-refresh]');
  let isLoadingRegisteredClients = false;

  const formatRegisteredDate = (value) => {
    const parsed = value ? new Date(value) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) {
      return '-';
    }

    return parsed.toLocaleString();
  };

  const escapeHtml = (value) =>
    String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

  const setRegisteredClientsStatus = (message, state) => {
    if (!registeredClientsStatusEl) {
      return;
    }

    registeredClientsStatusEl.textContent = message;
    if (state) {
      registeredClientsStatusEl.setAttribute('data-state', state);
    } else {
      registeredClientsStatusEl.removeAttribute('data-state');
    }
  };

  const setRegisteredClientsLoading = (loading) => {
    registeredClientsRefreshEls.forEach((buttonEl) => {
      buttonEl.disabled = loading;
      buttonEl.textContent = loading ? 'Loading...' : 'Refresh';
    });
  };

  const renderRegisteredClients = (clients) => {
    if (!registeredClientsBodyEl) {
      return;
    }

    if (!Array.isArray(clients) || !clients.length) {
      registeredClientsBodyEl.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-4 text-muted">No registered clients yet.</td>
        </tr>
      `;
      return;
    }

    registeredClientsBodyEl.innerHTML = clients
      .map((client, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(client.full_name || '-')}</td>
          <td>${escapeHtml(client.category || '-')}</td>
          <td>${escapeHtml(client.city_prov || '-')}</td>
          <td>${escapeHtml(client.review_status || 'accepted')}</td>
          <td>${escapeHtml(formatRegisteredDate(client.created_at))}</td>
        </tr>
      `)
      .join('');
  };

  const loadRegisteredClients = async () => {
    if (!registeredClientsBodyEl || isLoadingRegisteredClients) {
      return;
    }

    isLoadingRegisteredClients = true;
    setRegisteredClientsLoading(true);
    setRegisteredClientsStatus('Loading registered clients...', 'loading');
    registeredClientsBodyEl.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-4 text-muted">Loading...</td>
      </tr>
    `;

    try {
      const response = await fetch('/api/registered-clients', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Failed to load registered clients.');
      }

      renderRegisteredClients(payload.clients);
      setRegisteredClientsStatus(`Showing ${payload.count || 0} registered client(s).`, 'ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load registered clients.';
      registeredClientsBodyEl.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-4 text-danger">${message}</td>
        </tr>
      `;
      setRegisteredClientsStatus('Could not load registered clients right now.', 'error');
    } finally {
      isLoadingRegisteredClients = false;
      setRegisteredClientsLoading(false);
    }
  };

  if (registeredClientsModalEl) {
    registeredClientsModalEl.addEventListener('show.bs.modal', () => {
      loadRegisteredClients();
    });
  }

  registeredClientsRefreshEls.forEach((buttonEl) => {
    buttonEl.addEventListener('click', () => {
      loadRegisteredClients();
    });
  });

  const trailMapEl = document.querySelector('#trail-map-canvas');
  const trailMapStatusEl = document.querySelector('[data-trail-map-status]');
  const trailDistanceEl = document.querySelector('[data-trail-distance]');
  if (trailDistanceEl) {
    trailDistanceEl.textContent = '15';
    if (trailDistanceEl.parentElement) {
      trailDistanceEl.parentElement.style.display = '';
    }
  }

  const setTrailMapStatus = (message, state) => {
    if (!trailMapStatusEl) {
      return;
    }

    trailMapStatusEl.textContent = message;
    if (state) {
      trailMapStatusEl.setAttribute('data-state', state);
    } else {
      trailMapStatusEl.removeAttribute('data-state');
    }
  };

  const appendUniquePoint = (segment, latitude, longitude) => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }

    const previousPoint = segment[segment.length - 1];
    if (previousPoint && previousPoint[0] === latitude && previousPoint[1] === longitude) {
      return;
    }

    segment.push([latitude, longitude]);
  };

  const parseTrailKml = (kmlText) => {
    const coordinateBlocks = [...kmlText.matchAll(/<coordinates>([\s\S]*?)<\/coordinates>/gi)];
    const segments = [];

    coordinateBlocks.forEach((coordinateBlock) => {
      const rawCoordinates = (coordinateBlock[1] || '').trim().split(/\s+/);
      const segment = [];

      rawCoordinates.forEach((point) => {
        const [longitudeText, latitudeText] = point.split(',');
        appendUniquePoint(segment, Number(latitudeText), Number(longitudeText));
      });

      if (segment.length > 1) {
        segments.push(segment);
      }
    });

    return segments;
  };

  const parseTrailGeoJson = (geoJsonData) => {
    const segments = [];
    const features = Array.isArray(geoJsonData && geoJsonData.features) ? geoJsonData.features : [];

    features.forEach((feature) => {
      const geometry = feature && feature.geometry;
      if (!geometry || !Array.isArray(geometry.coordinates)) {
        return;
      }

      if (geometry.type === 'LineString') {
        const segment = [];
        geometry.coordinates.forEach((coordinatePair) => {
          if (!Array.isArray(coordinatePair)) {
            return;
          }
          appendUniquePoint(segment, Number(coordinatePair[1]), Number(coordinatePair[0]));
        });
        if (segment.length > 1) {
          segments.push(segment);
        }
        return;
      }

      if (geometry.type === 'MultiLineString') {
        geometry.coordinates.forEach((lineCoordinates) => {
          if (!Array.isArray(lineCoordinates)) {
            return;
          }
          const segment = [];
          lineCoordinates.forEach((coordinatePair) => {
            if (!Array.isArray(coordinatePair)) {
              return;
            }
            appendUniquePoint(segment, Number(coordinatePair[1]), Number(coordinatePair[0]));
          });
          if (segment.length > 1) {
            segments.push(segment);
          }
        });
      }
    });

    return segments;
  };

  const loadTrailSegments = async () => {
    const embeddedGeoJson = window.GAGAYAM_TRAIL_GEOJSON;
    if (embeddedGeoJson) {
      const embeddedSegments = parseTrailGeoJson(embeddedGeoJson);
      if (embeddedSegments.length) {
        return embeddedSegments;
      }
    }

    const sources = [
      {
        url: 'assets/data/gagayam-trail-run.json',
        parser: parseTrailGeoJson,
        read: (response) => response.json()
      },
      {
        url: 'assets/data/gagayam-trail-run.kml',
        parser: parseTrailKml,
        read: (response) => response.text()
      }
    ];

    let lastError = null;

    for (const source of sources) {
      try {
        const response = await fetch(source.url, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const rawData = await source.read(response);
        const segments = source.parser(rawData);
        if (!segments.length) {
          throw new Error(`No route coordinates found in ${source.url}.`);
        }

        return segments;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error('Unable to load trail route data.');
  };

  const renderTrailMap = (segments) => {
    const trailMap = L.map(trailMapEl, {
      scrollWheelZoom: false,
      dragging: false,
      touchZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      zoomControl: false,
      tap: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(trailMap);

    const trailLayerGroup = L.featureGroup();
    let pointCount = 0;
    let distanceMeters = 0;

    segments.forEach((segment) => {
      pointCount += segment.length;

      for (let index = 1; index < segment.length; index += 1) {
        const previousPoint = L.latLng(segment[index - 1][0], segment[index - 1][1]);
        const currentPoint = L.latLng(segment[index][0], segment[index][1]);
        distanceMeters += previousPoint.distanceTo(currentPoint);
      }

      L.polyline(segment, {
        color: '#f08a24',
        weight: 4,
        opacity: 0.95
      }).addTo(trailLayerGroup);
    });

    trailLayerGroup.addTo(trailMap);

    const firstPoint = segments[0][0];
    const lastSegment = segments[segments.length - 1];
    const lastPoint = lastSegment[lastSegment.length - 1];

    L.circleMarker(firstPoint, {
      radius: 6,
      color: '#14532d',
      fillColor: '#22c55e',
      fillOpacity: 1,
      weight: 2
    }).bindTooltip('Start').addTo(trailMap);

    L.circleMarker(lastPoint, {
      radius: 6,
      color: '#7c2d12',
      fillColor: '#f97316',
      fillOpacity: 1,
      weight: 2
    }).bindTooltip('Finish').addTo(trailMap);

    const trailBounds = trailLayerGroup.getBounds();
    trailMap.fitBounds(trailBounds, { padding: [24, 24] });

    return { trailMap, pointCount, distanceMeters, trailBounds };
  };

  if (!trailMapEl || typeof L === 'undefined') {
    return;
  }

  setTrailMapStatus('Loading trail route...', 'loading');

  let trailMap = null;
  let trailBounds = null;
  let resizeFrameId = null;

  const syncTrailViewport = () => {
    if (!trailMap || !trailMapEl.isConnected || !trailBounds || !trailBounds.isValid()) {
      return;
    }

    trailMap.invalidateSize();
    trailMap.fitBounds(trailBounds, { padding: [24, 24] });
  };

  const queueTrailViewportSync = () => {
    if (resizeFrameId) {
      window.cancelAnimationFrame(resizeFrameId);
    }

    resizeFrameId = window.requestAnimationFrame(() => {
      resizeFrameId = null;
      syncTrailViewport();
    });
  };

  const handleViewportResize = () => {
    queueTrailViewportSync();
  };

  loadTrailSegments()
    .then((segments) => {
      if (!trailMapEl.isConnected) {
        throw new Error('Trail map element is no longer attached to the page.');
      }

      const renderResult = renderTrailMap(segments);
      trailMap = renderResult.trailMap;
      trailBounds = renderResult.trailBounds;
      trailMapEl.classList.remove('is-error');

      if (trailDistanceEl) {
        trailDistanceEl.textContent = (renderResult.distanceMeters / 1000).toFixed(2);
      }

      if (trailPointCountEl) {
        trailPointCountEl.textContent = renderResult.pointCount.toLocaleString();
      }

      setTrailMapStatus('Route loaded successfully.', 'ready');
      queueTrailViewportSync();
      window.addEventListener('resize', handleViewportResize, { passive: true });
    })
    .catch(() => {
      if (trailMap) {
        trailMap.remove();
        trailMap = null;
      }
      trailBounds = null;
      window.removeEventListener('resize', handleViewportResize);
      if (resizeFrameId) {
        window.cancelAnimationFrame(resizeFrameId);
        resizeFrameId = null;
      }
      trailMapEl.classList.add('is-error');
      trailMapEl.textContent = 'Unable to load the trail map route data.';
      setTrailMapStatus('Failed to load route data.', 'error');
    });
})();

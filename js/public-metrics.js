(function () {
  const feedUrl = '/data/public-metrics.json';

  const metricIds = {
    volunteersOnboarded: 'metric-volunteers',
    doorsKnocked: 'metric-doors',
    callsMade: 'metric-calls',
    textsSent: 'metric-texts',
    townHallsHeld: 'metric-townhalls'
  };

  const formatNumber = (value) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value || 0);

  const setText = (id, text) => {
    const node = document.getElementById(id);
    if (node) node.textContent = text;
  };

  const renderMetrics = (payload) => {
    const metrics = payload?.metrics || {};

    Object.entries(metricIds).forEach(([key, id]) => {
      const value = Number(metrics[key]);
      setText(id, Number.isFinite(value) ? formatNumber(value) : 'N/A');
    });

    setText(
      'metric-endorsements-confirmed',
      formatNumber(Number(metrics?.endorsements?.confirmed))
    );
    setText(
      'metric-endorsements-pending',
      formatNumber(Number(metrics?.endorsements?.pending))
    );
    setText(
      'metric-endorsements-outreach',
      formatNumber(Number(metrics?.endorsements?.outreach))
    );

    const updated = new Date(payload?.lastUpdated);
    setText(
      'metrics-last-updated',
      Number.isNaN(updated.getTime())
        ? 'Last updated: Unavailable'
        : `Last updated: ${updated.toLocaleString('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short'
          })}`
    );

    setText(
      'metrics-methodology',
      `Methodology: ${payload?.methodology || 'Aggregate public campaign activity metrics.'}`
    );
  };

  const renderFallback = () => {
    const fallbackIds = [
      ...Object.values(metricIds),
      'metric-endorsements-confirmed',
      'metric-endorsements-pending',
      'metric-endorsements-outreach'
    ];

    fallbackIds.forEach((id) => setText(id, 'N/A'));
    setText('metrics-last-updated', 'Last updated: Unavailable');
    setText(
      'metrics-methodology',
      'Methodology: This section publishes aggregate, privacy-safe metrics from a curated public feed.'
    );
  };

  fetch(feedUrl, { cache: 'no-cache' })
    .then((response) => {
      if (!response.ok) throw new Error(`Feed request failed: ${response.status}`);
      return response.json();
    })
    .then(renderMetrics)
    .catch(renderFallback);
})();

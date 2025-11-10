(function () {
  function enc(value) {
    return encodeURIComponent(value);
  }

  function linkFor(platform, text, url, subject) {
    switch (platform) {
      case 'bsky':
        return 'https://bsky.app/intent/compose?text=' + enc(text + ' ' + url);
      case 'x':
        return 'https://twitter.com/intent/tweet?text=' + enc(text) + '&url=' + enc(url);
      case 'facebook':
        return 'https://www.facebook.com/sharer/sharer.php?u=' + enc(url) + '&quote=' + enc(text);
      case 'linkedin':
        return 'https://www.linkedin.com/sharing/share-offsite/?url=' + enc(url);
      case 'whatsapp':
        return 'https://api.whatsapp.com/send?text=' + enc(text + ' ' + url);
      case 'sms':
        return 'sms:?&body=' + enc(text + ' ' + url);
      case 'email':
        return 'mailto:?subject=' + enc(subject || '') + '&body=' + enc(text + '\n\n' + url);
      case 'download':
        return url;
      default:
        return url;
    }
  }

  function triggerDownload(assetUrl, filename) {
    if (!assetUrl) {
      return;
    }
    var tempLink = document.createElement('a');
    tempLink.href = assetUrl;
    if (filename) {
      tempLink.download = filename;
    }
    tempLink.rel = 'noopener';
    document.body.appendChild(tempLink);
    tempLink.click();
    document.body.removeChild(tempLink);
  }

  function enableNativeShareButtons() {
    if (!('share' in navigator)) {
      return;
    }
    var nativeButtons = document.querySelectorAll('a.share-button[data-platform="native"]');
    nativeButtons.forEach(function (button) {
      button.hidden = false;
    });
  }

  enableNativeShareButtons();

  document.addEventListener('click', function (event) {
    var trigger = event.target.closest('a.share-button');
    if (!trigger) {
      return;
    }

    event.preventDefault();
    var platform = trigger.dataset.platform;
    if (!platform) {
      return;
    }

    var text = trigger.dataset.text || '';
    var url = trigger.dataset.url || window.location.href;
    var subject = trigger.dataset.subject || '';

    if (platform === 'native' && navigator.share) {
      navigator
        .share({ title: subject || document.title, text: text, url: url })
        .catch(function (error) {
          if (error && error.name === 'AbortError') {
            return;
          }
          window.open(linkFor('email', text, url, subject), '_blank', 'noopener,noreferrer');
        });
      return;
    }

    if (platform === 'download') {
      triggerDownload(trigger.dataset.asset || url, trigger.dataset.filename || '');
      return;
    }

    var shareUrl = linkFor(platform, text, url, subject);
    window.open(shareUrl, '_blank', 'noopener,noreferrer');
  });
})();

const SHARE_LINES = [
  "They don’t represent you. They represent their donors.",
  "85% of her campaign money comes from outside WA-10. That is not representation.",
  "Every dollar they take has a string attached. Ours never will.",
  "Executives have PACs. We have people who have had enough.",
  "They protect profits. We protect families.",
  "They took the money and forgot the people who sent them there.",
  "Two choices: the money or the people. I choose Adam Arafat.",
  "They have money. We have momentum.",
  "They write laws in boardrooms. We write history in ballots.",
  "On August 4, WA-10 decides if big money wins or the people do."
];

function rotateShareLine() {
  const line = document.getElementById("share-line");
  if (!line) return;
  const random = SHARE_LINES[Math.floor(Math.random() * SHARE_LINES.length)];
  line.textContent = random;
}

function setupShareIcons() {
  const shareLine = document.getElementById("share-line");
  document.querySelectorAll(".share-icon").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      const net = btn.dataset.net;
      const shareUrl = encodeURIComponent(window.location.href);
      const text = shareLine ? encodeURIComponent(shareLine.textContent) : "";
      let url = "";

      switch (net) {
        case "x":
          url = `https://twitter.com/intent/tweet?text=${text}%20${shareUrl}`;
          break;
        case "facebook":
          url = `https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`;
          break;
        case "tiktok":
          url = `https://www.tiktok.com/share?url=${shareUrl}&text=${text}`;
          break;
        case "bluesky":
          url = `https://bsky.app/intent/compose?text=${text}%20${shareUrl}`;
          break;
        case "reddit":
          url = `https://www.reddit.com/submit?url=${shareUrl}&title=${text}`;
          break;
        case "sms":
          url = `sms:?&body=${text}%20${shareUrl}`;
          break;
        case "email":
          url = `mailto:?subject=${text}&body=${shareUrl}`;
          break;
        default:
          url = shareUrl;
      }

      window.open(url, "_blank", "noopener,noreferrer");
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  rotateShareLine();
  setInterval(rotateShareLine, 7000);
  setupShareIcons();
});

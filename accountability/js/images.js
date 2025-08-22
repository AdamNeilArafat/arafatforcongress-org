const PLACEHOLDER = "data:image/svg+xml;utf8," + encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' fill='#e9eef5'/>" +
  "<g fill='#98a5b4'><circle cx='32' cy='24' r='12'/><rect x='10' y='40' width='44' height='16' rx='8'/></g></svg>"
);

export function headshot(member, size = "225x275") {
  const bio = (member?.bioguide_id || member?.id || "").trim();
  if (bio) {
    const base = "https://theunitedstates.io/images/congress";
    return {
      src: `${base}/${size}/${bio}.jpg`,
      srcset: `${base}/100x125/${bio}.jpg 100w, ${base}/225x275/${bio}.jpg 225w`,
      sizes: "(max-width: 480px) 100px, 36px",
      alt: `${member?.name || bio} headshot`,
      placeholder: PLACEHOLDER
    };
  }
  if (member?.photo) {
    return { src: member.photo, srcset: "", sizes: "", alt: `${member?.name || "Member"} headshot`, placeholder: PLACEHOLDER };
  }
  return { src: PLACEHOLDER, srcset: "", sizes: "", alt: `${member?.name || "Member"} headshot`, placeholder: PLACEHOLDER };
}

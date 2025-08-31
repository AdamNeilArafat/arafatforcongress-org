(function(){
  const placeholder = document.getElementById('footer');
  if(!placeholder) return;
  fetch('footer.html')
    .then(resp => resp.text())
    .then(html => {
      placeholder.innerHTML = html;
      const yr = placeholder.querySelector('#yr');
      if(yr) yr.textContent = new Date().getFullYear();
    })
    .catch(err => console.error('Footer load failed', err));
})();

(function(){
  function toAbs(u){
    return String(u).replace(/^(\.\/|(\.\.\/)+)?data\//, '/data/');
  }
  function bust(u){
    try{
      var url = new URL(u, location.origin);
      url.searchParams.set('v', String(Date.now()));
      return url.pathname + url.search;
    }catch(_){ return u; }
  }
  var ofetch = window.fetch.bind(window);
  window.fetch = function(input, init){
    try{
      if (typeof input === 'string' && /(^|\/)data\//.test(input)) {
        return ofetch(bust(toAbs(input)), init);
      }
      if (typeof Request !== 'undefined' && input instanceof Request) {
        var url = input.url || '';
        if (/(^|\/)data\//.test(url)) {
          var req = new Request(bust(toAbs(url)), input);
          return ofetch(req, init);
        }
      }
    } catch(_){}
    return ofetch(input, init);
  };
})();

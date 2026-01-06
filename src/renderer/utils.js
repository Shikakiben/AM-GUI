(function(){
  function getIconUrl(name) {
    if (!name) return 'appicon://blank.png';
    return `appicon://${name}.png`;
  }

  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  window.utils = Object.freeze({
    getIconUrl,
    debounce
  });
})();
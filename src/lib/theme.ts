/** Inline script that applies the saved theme before first paint. */
export const themeScript = `try{var t=localStorage.getItem('mp-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`;

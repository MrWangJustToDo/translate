import fs from "fs";

const loadDevToolScript = async () => {
  const res = await fetch("https://mrwangjusttodo.github.io/myreact-devtools/bundle/forward-dev.js");

  const text = await res.text();

  return text;
};

const init = async () => {
  const devToolScript = await loadDevToolScript();

  fs.writeFileSync("./devtool/index.js", devToolScript);
}

init();
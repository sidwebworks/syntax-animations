export const getTextmateGrammar = async (name: string) => {
  const res = await fetch(`https://unpkg.com/tm-grammars@1.17.3/grammars/${name}.json`, {
    method: "GET",
    mode: "cors",
  });

  const data = await res.json();

  return data;
};

export const getTextmateTheme = async (name: string) => {
  const res = await fetch(`https://unpkg.com/tm-themes@1.10.0/themes/${name}.json`, {
    method: "GET",
    mode: "cors",
  });

  const data = await res.json();

  return data;
};

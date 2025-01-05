export async function getArray(fileName) {
    const data = await fetch(fileName);
    const jsonData = await data.text();
    return JSON.parse(jsonData);
}

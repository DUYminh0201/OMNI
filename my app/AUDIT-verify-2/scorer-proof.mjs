const weights = { quality: 0.4, speed: 0.4, cost: 0.2 };
// Ca thuc te: Gemini VUOT TROI ve chat luong, Nvidia kem hon moi mat
const models = [
  { id: "gemini-3.5-flash", provider: "gemini", q: 95, sp: 90, co: 80 },
  { id: "nvidia-nemotron",  provider: "nvidia", q: 78, sp: 82, co: 85 },
];
const score = (m, bonus) => {
  let s = weights.quality*m.q + weights.speed*m.sp + weights.cost*m.co;
  return Math.round((bonus && (m.provider==="nvidia"||m.provider==="openai") ? s+10 : s)*10)/10;
};
console.log("weights =", JSON.stringify(weights));
console.log("");
console.log("Model".padEnd(20), "quality".padStart(8), "speed".padStart(6), "cost".padStart(6), "diem goc".padStart(9), "sau bonus".padStart(10));
console.log("-".repeat(66));
for (const m of models) {
  console.log(m.id.padEnd(20), String(m.q).padStart(8), String(m.sp).padStart(6), String(m.co).padStart(6), String(score(m,false)).padStart(9), String(score(m,true)).padStart(10));
}
const b = models.map(m=>({id:m.id,s:score(m,true)})).sort((x,y)=>y.s-x.s);
const n = models.map(m=>({id:m.id,s:score(m,false)})).sort((x,y)=>y.s-x.s);
console.log("");
console.log("KHONG bonus -> nguoi thang:", n[0].id, "("+n[0].s+")");
console.log("CO bonus    -> nguoi thang:", b[0].id, "("+b[0].s+")");
console.log("");
console.log("Gemini hon Nvidia:", models[0].q-models[1].q, "diem quality,", models[0].sp-models[1].sp, "diem speed");
console.log("Nhung sau bonus, Nvidia thang => SAI. Bonus 10 diem = 10% thang diem tuyet doi,");
console.log("no de len toan bo trong so (quality 0.4 = toi da 40 diem).");

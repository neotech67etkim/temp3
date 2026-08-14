// 초기 설정 창(NAS 경로 입력)의 preload 스크립트.
// contextIsolation이 켜져 있으면 렌더러(HTML/JS)는 Node.js API에 직접
// 접근할 수 없다(require 등). 그래서 대신 이 preload가 안전하게
// contextBridge로 "submit" 함수 하나만 노출해준다.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("promptAPI", {
  submit: (value) => ipcRenderer.send("prompt-submitted", value),
});

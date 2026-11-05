import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import type {
  AnimationAction,
  AnimationMixer,
  Material,
  Mesh,
  Object3D,
} from "three";

const CLIP_LABEL: Record<string, string> = {
  idle: "待機",
  takeoff: "飛び立ち",
  flying: "飛行",
  glide: "滑空",
  landing: "着地",
  hop: "跳ね",
  hop_big: "大跳ね",
  hover: "停空",
  turn_L: "左旋回",
  turn_R: "右旋回",
  dive_in: "急降下・入",
  dive: "急降下",
  peck: "ついばみ",
  sit_in: "腰を下ろす",
  sit: "座る",
  sit_out: "立ち上がる",
  stretch: "伸び",
  preen: "羽繕い",
  peer_in: "覗き込み",
  peer: "覗く",
  peer_out: "覗き終わり",
  alert_in: "警戒・入",
  alert: "警戒",
  alert_out: "警戒・出",
  sing: "さえずり",
  sing_hop: "鳴いて跳ね",
  walk: "歩き",
  struggle: "もがき",
};

export function SumiBird() {
  return null;
}

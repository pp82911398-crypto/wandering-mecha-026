# 流浪机甲 026 · Wandering Mecha 026

**一个用 Three.js 程序化搭建的重型机甲实时展示项目。**
**A real-time heavy-mech showcase built procedurally with Three.js.**

[中文](#中文) · [English](#english)

---

## 中文

### 项目简介

《流浪机甲 026》是一个在浏览器里运行的机甲展示 / 技术实验项目。026 是一台约 40 个场景单位（约 82 米）高的三臂重型机甲，全部由代码程序化建模，没有导入外部模型或贴图。

项目包含四个可切换的实时场景：

- **成品间**：近距离查看机甲、涂装、材质、灯光、武器和姿态。
- **港区外景**：雨夜港口，机甲从山体机库出库到码头。
- **机库内**：工业机库、检修平台、升降梯和登机桥。
- **穹顶机场**：大型机场环境，可切换视角、走动和登机（开发中）。

项目同时保留了各部位的独立实验页面（头、颈、胸、手臂、腿），方便单独修改结构后再装配到整机。

### 完成度：约 60%

这是作者目前的估计。能看、能玩的部分已经比较完整，但还不是最终成品；很多地方仍需要继续打磨。

| 模块 | 状态 |
| --- | --- |
| 程序化机体 / 各部位模块 | 主体完成，装甲与机械细节继续打磨 |
| 材质、涂装、做旧、灯光 | 可用；四套涂装，持续微调 |
| 四个场景 | 可运行；灯光、构图、性能继续完善 |
| 武器 / 推进器 | 等离子炮、刀刃、锯爪、肩部导弹舱、背部/脚底/手掌推进可用 |
| 头部 / 腰部 / 手臂 / 手掌动作 | 部分完成；手指完整张开/抓握动画未完成 |
| 动画 / 镜头 / 电影化场景 | 部分完成；最终镜头与演示序列待做 |
| 音效 | 原型级 |
| 文档 / 测试 / 导出流程 | 早期阶段 |
| **总体** | **约 60%** |

**已经可以体验：**

- 完整机甲装配：头部/驾驶舱、颈部、胸肩背腰、三条手臂（等离子炮、刀刃、锯爪）、双腿与脚部。
- 四套涂装：炭黑·夜战、雪原白、海军灰·舰载、工程黄·重型作业。
- PBR 材质、程序化做旧/雨痕/划痕、分级 R 角、反应堆与关节灯光。
- 四个场景与共享场景导航；成品间有视角预设、曝光、4K 出图。
- 武器展开、肩部导弹舱、头部/腰部动作、手掌开握、手腕折腕。
- 背部推进柱/展翼、脚底推进、手掌推进、悬空与姿态预设。
- 机库/穹顶的检修平台、升降梯、登机桥等场景交互（持续完善）。

**还没完成，欢迎有兴趣的人接手：**

- 手指的完整张开/抓握动画（目前以手腕折腕和基础手型为主）。
- 装甲细节、机械结构、极限姿态下的穿模与碰撞打磨。
- 更完整的动画库、镜头序列、最终电影化场景。
- 音效设计与环境声。
- 移动端/低性能设备适配、性能与内存优化。
- 自动化测试、文档、截图与演示视频（本仓库不包含录像和参考图）。

### 运行

需要支持 WebGL2 的桌面浏览器（Chrome / Edge / Safari）和网络（Three.js 通过 CDN importmap 加载）。不需要构建，也不需要 npm。

```bash
# 在仓库根目录
python3 -m http.server 8777
```

然后打开：

- 成品间：<http://localhost:8777/finallab/>
- 港区外景：<http://localhost:8777/portstorm/?q=low>
- 机库内：<http://localhost:8777/hangar/>
- 穹顶机场：<http://localhost:8777/domelab/>

页面顶部有场景切换。部分参数支持 URL，例如 `?scheme=night|snow|navy|hazard`、`?wear=0`、`?surf=0`、`?round=0`、`?q=cinema`。

### 操作

- 场景切换：页面顶部导航。
- 控制面板：右侧“控制面板”，按分类展开。
- 自由镜头：拖动鼠标或点击锁定；`WASD` 移动，`Q/E` 下降/上升，滚轮调视野，`Esc` 释放鼠标。
- 成品间：视角、涂装、磨损、灯光、头部、腰部、武器、手掌、推进器、姿态预设等滑杆/按钮。
- 穹顶机场：第一/第三人称、`E` 交互、升降梯与登机流程（开发中）。

### 目录

```
finallab/    成品间：整机装配、材质、灯光、界面、姿态、推进器
portstorm/   港区外景：港口、山体机库、履带平台、出库
hangar/      机库内：工业机库、检修设备、升降梯、机位
domelab/     穹顶机场：机场环境、人物、电梯、登机桥
headlab/     头部与驾驶舱模块
necklab/     颈部模块
torsolab/    胸/肩/背/腰模块
armlab/      三条手臂模块
leglab/      胯部与双腿模块
ui/          共用 HUD / 控制面板
src/         共用场景工具（几何、材质、特效、后期、音频、机库环境）
docs/        技术笔记（中文）
tools/       可选的导出/检查脚本
```

### 参与开发

欢迎 issue、fork 和 pull request。大改之前建议先开 issue 说明方向，避免和现有结构冲突。

适合接手的方向：装甲与机械细节、骨骼/动画、材质与着色器、场景灯光与构图、性能优化、移动端适配、音效、文档与测试。

美术方向保持一致：硬朗折面的重型机甲、接近 10 头身的巨物比例、026 的炭黑/黄橙配色；不做圆润的卡通装甲。

### 说明

- 本仓库只包含项目的核心源码和文档。**建模参考图、截图、录像、成片、备份、第三方图片素材均未包含**。
- 仓库采用 **MIT 许可证**，可自由使用、修改和分发（保留版权声明）；欢迎二次开发和合作。
- 项目仍在开发中，欢迎反馈和贡献。

---

## English

### About

**Wandering Mecha 026** is a browser-based heavy-mech showcase and technical playground. The 026 is a three-armed heavy mech roughly 40 scene units (about 82 m) tall, built entirely in code with Three.js — no imported models or texture maps.

It ships with four real-time scenes:

- **Finishing room** — close-up inspection of the mech, liveries, materials, lighting, weapons and poses.
- **Port exterior** — a rainy-night harbor; the mech rolls out of a hillside hangar onto the pier.
- **Hangar interior** — an industrial hangar with maintenance platforms, lifts and a boarding bridge.
- **Dome airport** — a large airport environment with view presets, walking and boarding (work in progress).

Each body part also has a standalone lab module (head, neck, torso, arms, legs) so it can be modified and tested before being assembled into the full mech.

### Completion: roughly 60%

This is the author's current estimate. The project is playable and visually presentable, but it is not a finished product; many areas still need polish.

| Area | Status |
| --- | --- |
| Procedural mech / part modules | Main body done; armor and mechanical detail ongoing |
| Materials, liveries, wear, lighting | Usable; four liveries, ongoing tuning |
| Four scenes | Playable; lighting, composition and performance ongoing |
| Weapons / propulsion | Plasma cannon, blades, saw claw, shoulder missile bays, back/sole/palm thrusters working |
| Head / waist / arms / hands | Partial; full finger articulation is not finished |
| Animation / cameras / cinematics | Partial; final shots and demo sequence still to do |
| Audio | Prototype |
| Docs / tests / export pipeline | Early |
| **Overall** | **~60%** |

**What you can try now:**

- Full mech assembly: head/cockpit, neck, torso/shoulders/back/waist, three arms (plasma cannon, blade, saw claw), legs and feet.
- Four liveries: carbon night, snow white, navy, hazard yellow.
- PBR materials, procedural wear/rain streaks/scratches, graded round edges, reactor and joint lights.
- Four scenes with shared navigation; view presets, exposure and 4K still export in the finishing room.
- Weapon deployment, shoulder missile bays, head/waist motion, hand grip and wrist fold.
- Back thruster columns/wings, sole thrusters, palm thrusters, hover and pose presets.
- Hangar/dome maintenance platforms, lifts and boarding bridge interactions (work in progress).

**Not finished — contributors welcome:**

- Full finger articulation / spread / grip animation (currently wrist fold plus basic hand poses).
- Armor and mechanical detail; collision and edge-case polish.
- A larger animation library, camera sequences and a final cinematic scene.
- Sound design and ambience.
- Mobile / low-end device support, performance and memory optimization.
- Automated tests, documentation, screenshots and demo videos (this repo does not include recordings or reference images).

### Run

A desktop browser with WebGL2 (Chrome / Edge / Safari) and network access (Three.js is loaded from a CDN import map). No build step and no npm required.

```bash
# from the repository root
python3 -m http.server 8777
```

Then open:

- Finishing room: <http://localhost:8777/finallab/>
- Port exterior: <http://localhost:8777/portstorm/?q=low>
- Hangar interior: <http://localhost:8777/hangar/>
- Dome airport: <http://localhost:8777/domelab/>

Use the scene tabs at the top of each page. Some URL parameters are supported, e.g. `?scheme=night|snow|navy|hazard`, `?wear=0`, `?surf=0`, `?round=0`, `?q=cinema`.

### Controls

- Scene switching: top navigation.
- Control panel: the “控制面板” panel on the right.
- Free camera: drag or click to capture the mouse; `WASD` to move, `Q/E` down/up, wheel to zoom, `Esc` to release.
- Finishing room: view, livery, wear, lighting, head, waist, weapons, hands, propulsion and pose presets.
- Dome airport: first/third person, `E` to interact, lifts and boarding (work in progress).

### Structure

```
finallab/    finishing room: assembly, materials, lighting, UI, poses, propulsion
portstorm/   port exterior: harbor, hillside hangar, crawler, roll-out
hangar/      hangar interior: industrial hall, maintenance gear, lifts, bays
domelab/     dome airport: environment, visitors, lifts, boarding bridge
headlab/     head and cockpit module
necklab/     neck module
torsolab/    chest/shoulder/back/waist module
armlab/      three arm modules
leglab/      hips and legs module
ui/          shared HUD / control dock
src/         shared scene utilities (geometry, materials, FX, post, audio, hangar env)
docs/        technical notes (Chinese)
tools/       optional export / check scripts
```

### Contributing

Issues, forks and pull requests are welcome. For large changes, open an issue first so the direction can be discussed and kept compatible with the current structure.

Good areas to pick up: armor and mechanical detail, rigging/animation, materials and shaders, scene lighting and composition, performance, mobile support, audio, documentation and tests.

Please keep the art direction consistent: hard-surface, angular heavy mech, roughly 10-heads-tall kaiju scale, the 026 carbon/yellow-orange palette; no rounded cartoon armor.

### Notes

- This repository contains the core source and docs only. **Modeling reference images, screenshots, recordings, final renders, backups and third-party image assets are not included.**
- Released under the **MIT License**; you are free to use, modify and distribute it with the copyright notice. Collaboration and derivative work are welcome.
- The project is still in development. Feedback and contributions are welcome.

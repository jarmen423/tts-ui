# Ideas / TODOs

## TODOs:
[ X ] xAI OAuth manual code-paste flow (like m26pipeline EA auth)
- Implemented loopback on 56121 for dev
- Added paste-from-address-bar UI + submit path for production
- Documented the plan in README.md and AGENTS.md

[ ] UI Gap:
- After speech generation (nb. not referring to sample voice previews), Audio Reactive Canvas Visualizer Should take over the whole screen like with an overlay. My preference is that it defaults to the prompter mode. I dont want it to be completely the same as when you click "fullscreen" but rather liek an overlay that is pretty large maybe ~70% of the vieweable screen and dims the rest of the site in the background. 

[X] For the LLM Script Enhancer:
- Current propmpt uses markdown syntax, sometimes causes TTS engings to speak that syntax out. Change to tell the model not to output markdown syntax because the TTS model may read that out loud.
- Add preset option that adds if your TTS provider supports audio tags that effect delivery e.g., eleven labs v3 or fish audio s2.1.
- changes system prompt for LLM Script Enhancement agent so they know to add audio tags. 

[ ] ADD SUPPORT FOR [SCENE #] TAGS : 
- Scene tags cause the system to generate a seperate clip for each scene and respect time stamps for scene start and end. 

[X] providers that support voice cloning should have that option there:
- elevenlabs
- mistral
- fish audio
- not sure if any other like grok or gemini do?

[ ] add direct integration to agentmemorylabs.com subs. Direct connection to their memory graph and ability to TTS any of their nodes / research reports etc.
- or synthesize new creations for tts based on their memories with their agents or our dashboard agents
    - with their agents -> give api access 
    - or can use our dashboard agent.
## Ideads:
[ ] Voice picker/creator:
- uses gemini-embedding-2 omni-modal embeddings to create library of embeddings of different voices. 
- user says 'I want a voice that makes me feel like spring', 'i want a voice that sounds like a gamer' -> model surfaces best matching voice samples for the job. 
[ ] Avatar picker/creator (same concept as above!): 
- 
(PREMIUM FEATURES?)
[ ] find affordable avatar models to add
- [ ] **'Add avatar button'**
- [ ] **Hyperframes Agent**: (**'Create video' button**).
  - Behind the scenes uses code execution agent with heygen-hyperframes skills. 
  -  
- now create tts script + avatar model [not too far from automated shorts] + heygen hyperframes agent = AUTOMATED SHORTS/VIDEOS! YAY!
- need to research best options to provide this on the backend
    - **gemini omni** ? https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/omni-flash-preview?hl=en
    - wonder how good this is for avatars? https://huggingface.co/spaces/techfreakworm/LTX2.3-Studio

[ ] offer optional subscription for people who just like the app and dont use much other ai tools (dont have the necessary api keys set up or any credits with them)
- need to research options to provide this on the backend.
    - probably mistral for tts 

[ ] mark the hf space options free with hf token.
    - possibly add other webgpu hf space options , loads model into users browser for free from hf
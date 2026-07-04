# Ideas / TODOs

## TODOs:

[X] Make Script Editor & Synthesis text box expandable like the LLM Script Enhancer text box. 

[X] Change text box for 'model (optional)' in LLM Script Enhance to a drop down from the chosen provider.

[X] NVIDIA Magpie TTS provider (free BYOK via integrate.api.nvidia.com/v1/audio/speech, model nvidia/magpie-tts-multilingual)

- base url = https://integrate.api.nvidia.com/v1

[X] Add microphone use for users that want to record their own reference clips. 

- OmniVoice/VoxCPM reference + Fish voice-create sample: Record or Upload via ReferenceClipCapture

[ X ] xAI OAuth manual code-paste flow (like m26pipeline EA auth)

- Implemented loopback on 56121 for dev
- Added paste-from-address-bar UI + submit path for production
- Documented the plan in README.md and AGENTS.md

[X] For the LLM Script Enhancer:

- Current propmpt uses markdown syntax, sometimes causes TTS engings to speak that syntax out. Change to tell the model not to output markdown syntax because the TTS model may read that out loud.
- Add preset option that adds if your TTS provider supports audio tags that effect delivery e.g., eleven labs v3 or fish audio s2.1.
- changes system prompt for LLM Script Enhancement agent so they know to add audio tags. 

[ ] LLM Script Enhancer — **style direction buttons** (emotional override)

- Default (no button): smart model chooses tagging density — dry/technical input stays lightly tagged; emotional/narrative input gets richer tags.
- User picks a direction button (e.g. Angry, Yelling, Happy, Excited, Calm, Whispery, Dramatic): append a short override to the enhancer prompt so the model **must** shape delivery + provider-specific audio tags for that style (xAI / ElevenLabs / Fish syntax per `AUDIO_TAG_GUIDES`).
- UI: small preset row under the enhancer (or near AUDIO TAGS toggle); one active style at a time; "Auto" clears override.
- Wire through `enhance-for-tts` request body (e.g. `styleDirection?: string`) and `buildSystemPrompt()` in `server/llm-enhancer.ts`.

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

- [ ] ## Ideads:
  
  [ ] voice picker/creator

- uses gemini-embedding-2 (e.g., omni-modal embedding model) to create library of embeddings of different voices. 

- user says 'I want a voice that makes me feel like spring', 'i want a voice that sounds like a gamer' -> model surfaces best matching voice samples for the job. 
  [ ] Avatar picker/creator (same concept as above!): 

- (PREMIUM FEATURES?)
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
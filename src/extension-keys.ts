export enum ExtensionCommands {
  RUN_CURRENT_FILE = 'hylo.runCurrentFile',
  RUN_FOLDER = 'hylo.compileAndRunFolder',
  START_DEBUGGING = 'hylo.startDebugging',
  RESTART_LANGUAGE_SERVER = 'hylo.restartLanguageServer',
  UPDATE_LANGUAGE_SERVER = 'hylo.updateLanguageServer'
}

export const TOP_LEVEL_CONFIG_KEY = 'hylo.languageServer';

export enum ConfigurationKeys {
  VERSION = 'version',
  AUTO_UPDATE = 'autoUpdate'
}

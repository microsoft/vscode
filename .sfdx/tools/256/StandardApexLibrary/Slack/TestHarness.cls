global class TestHarness {
	global TestHarness() { }
	global Object clone() { }
	global Slack.TestHarness.State getNewSlackState() { }
global class Actions {
	global Object clone() { }
	global Object getComponent(Integer idx, System.Type clazz) { }
	global Object getComponentByName(String name, System.Type clazz) { }
	global Integer getComponentCount() { }
	global String getName() { }
	global String toString() { }

}
global class Button {
	global void click() { }
	global Object clone() { }
	global Slack.TestHarness.Confirm getConfirm() { }
	global String getLabel() { }
	global String getName() { }
	global String getStyle() { }
	global String getUrl() { }
	global String getValue() { }
	global String toString() { }

}
global class Channel {
	global void addUser(Slack.TestHarness.User user) { }
	global Boolean canBeOpenedByUser(Slack.TestHarness.User user) { }
	global Object clone() { }
	global String getId() { }
	global String getLocale() { }
	global Integer getMessageCount(Slack.TestHarness.User user) { }
	global List<Slack.TestHarness.Message> getMessages(Slack.TestHarness.User user) { }
	global String getName() { }
	global Slack.TestHarness.Team getTeam() { }
	global Boolean isPrivate() { }
	global void removeUser(Slack.TestHarness.User user) { }
	global Slack.TestHarness.Message sendMessage(Slack.TestHarness.UserSession userSession, String text) { }
	global String toString() { }

}
global class Checkbox {
	global Object clone() { }
	global Slack.TestHarness.Confirm getConfirm() { }
	global String getDescription() { }
	global Boolean getInitialValue() { }
	global String getLabel() { }
	global String getName() { }
	global Boolean getValue() { }
	global void setValue(Boolean value) { }
	global String toString() { }
	global void toggleValue() { }

}
global class CheckboxGroup {
	global Object clone() { }
	global Slack.TestHarness.Confirm getConfirm() { }
	global List<String> getInitialValue() { }
	global String getName() { }
	global List<Slack.TestHarness.Option> getOptions() { }
	global List<String> getValue() { }
	global void setValue(List<String> listOfIdentifiers) { }
	global String toString() { }
	global void toggleValue(Slack.TestHarness.Option option) { }
	global void toggleValue(String identifier) { }

}
global class Confirm {
	global Object clone() { }
	global String getConfirm() { }
	global String getDeny() { }
	global String getStyle() { }
	global String getText() { }
	global String getTitle() { }
	global String toString() { }

}
global class Context {
	global Object clone() { }
	global Object getComponent(Integer idx, System.Type clazz) { }
	global Integer getComponentCount() { }
	global String getName() { }
	global String toString() { }

}
global class ConversationsSelect {
	global Object clone() { }
	global Slack.TestHarness.Confirm getConfirm() { }
	global Slack.TestHarness.Filter getFilter() { }
	global List<String> getInitialMultiselectValue() { }
	global String getInitialValue() { }
	global Integer getMaxSelection() { }
	global List<String> getMultiselectValue() { }
	global String getName() { }
	global List<Slack.TestHarness.Option> getOptions() { }
	global String getPlaceholder() { }
	global String getValue() { }
	global Boolean isMultiselect() { }
	global void setMultiselectValue(List<String> listOfIdentifiers) { }
	global void setValue(String identifier) { }
	global String toString() { }

}
global class Datasource {
	global Object clone() { }
	global String getDefinition() { }
	global Map<String,Object> getProperties() { }
	global String toString() { }

}
global class DatePicker {
	global Object clone() { }
	global Slack.TestHarness.Confirm getConfirm() { }
	global String getInitialValue() { }
	global String getName() { }
	global String getPlaceholder() { }
	global String getValue() { }
	global void setValue(String value) { }
	global String toString() { }

}
global class DateTimePicker {
	global Object clone() { }
	global Slack.TestHarness.Confirm getConfirm() { }
	global String getDateLabel() { }
	global String getInitialValue() { }
	global String getName() { }
	global String getPlaceholder() { }
	global Boolean getRequired() { }
	global String getSubmissionName() { }
	global String getTimeLabel() { }
	global String getValue() { }
	global void setDateValue(String value) { }
	global void setTimeValue(String value) { }
	global void setValue(String value) { }
	global String toString() { }

}
global class Divider {
	global Object clone() { }
	global String getName() { }
	global String toString() { }

}
global class Enterprise {
	global Object clone() { }
	global String getId() { }
	global String getName() { }
	global String toString() { }

}
global class ExternalSelect {
	global Object clone() { }
	global Slack.TestHarness.Confirm getConfirm() { }
	global Slack.TestHarness.Datasource getDatasource() { }
	global List<String> getInitialMultiselectValue() { }
	global List<Slack.TestHarness.Option> getInitialOptions() { }
	global String getInitialValue() { }
	global Integer getMaxSelection() { }
	global Integer getMinQueryLength() { }
	global List<String> getMultiselectValue() { }
	global String getName() { }
	global List<Slack.TestHarness.OptionGroup> getOptionGroups() { }
	global List<Slack.TestHarness.Option> getOptions() { }
	global String getPlaceholder() { }
	global String getValue() { }
	global Boolean isMultiselect() { }
	global void query(String query) { }
	global void setMultiselectValue(List<String> listOfIdentifiers) { }
	global void setValue(String identifier) { }
	global String toString() { }

}
global class File {
	global Object clone() { }
	global String getExternalId() { }
	global String getName() { }
	global String getSource() { }
	global String toString() { }

}
global class Filter {
	global Object clone() { }
	global Boolean getExcludeBotUsers() { }
	global Boolean getExcludeExternalShared() { }
	global List<String> getInclude() { }
	global String toString() { }

}
global class Header {
	global Object clone() { }
	global String getName() { }
	global String getText() { }
	global String toString() { }

}
global class Home {
	global Object clone() { }
	global Slack.TestHarness.Button getButtonByLabel(String label) { }
	global Object getComponent(Integer idx, System.Type clazz) { }
	global Object getComponentByName(String name, System.Type clazz) { }
	global Integer getComponentCount() { }
	global Slack.TestHarness.Input getInputByLabel(String label) { }
	global String toString() { }

}
global class Image {
	global Object clone() { }
	global String getAltText() { }
	global String getImageUrl() { }
	global String getName() { }
	global String getTitle() { }
	global String toString() { }

}
global class InlineImage {
	global Object clone() { }
	global String getAltText() { }
	global String getImageUrl() { }
	global String toString() { }

}
global class Input {
	global Object clone() { }
	global Object getComponent(System.Type clazz) { }
	global Object getComponentByName(String name, System.Type clazz) { }
	global String getHint() { }
	global String getLabel() { }
	global String getName() { }
	global Boolean isRequired() { }
	global String toString() { }

}
global class Message {
	global Boolean canBeSeenByUser(Slack.TestHarness.User user) { }
	global Object clone() { }
	global Slack.TestHarness.Button getButtonByLabel(String label) { }
	global Slack.TestHarness.Channel getChannel() { }
	global Object getComponent(Integer idx, System.Type clazz) { }
	global Object getComponentByName(String name, System.Type clazz) { }
	global Integer getComponentCount() { }
	global Slack.TestHarness.Input getInputByLabel(String label) { }
	global String getMessageTs() { }
	global String getText() { }
	global Boolean isEphemeralMessage() { }
	global String toString() { }

}
global class Modal {
	global Object clone() { }
	global void close() { }
	global Slack.TestHarness.Button getButtonByLabel(String label) { }
	global String getCloseLabel() { }
	global Object getComponent(Integer idx, System.Type clazz) { }
	global Object getComponentByName(String name, System.Type clazz) { }
	global Integer getComponentCount() { }
	global Slack.TestHarness.Input getInputByLabel(String label) { }
	global String getInputError(String inputBlockName) { }
	global List<String> getInputErrorBlocks() { }
	global String getSubmitLabel() { }
	global String getTitle() { }
	global Boolean hasInputErrors() { }
	global Boolean submit() { }
	global String toString() { }

}
global class Option {
	global Object clone() { }
	global String getDescription() { }
	global String getIdentifier() { }
	global String getLabel() { }
	global String getUrl() { }
	global Boolean getValue() { }
	global String toString() { }

}
global class OptionGroup {
	global Object clone() { }
	global String getLabel() { }
	global List<Slack.TestHarness.Option> getOptions() { }
	global String toString() { }

}
global class Overflow {
	global void clickOption(Integer idx) { }
	global void clickOption(Slack.TestHarness.Option option) { }
	global void clickOption(String identifier) { }
	global Object clone() { }
	global Slack.TestHarness.Confirm getConfirm() { }
	global String getName() { }
	global List<Slack.TestHarness.Option> getOptions() { }
	global String toString() { }

}
global class RadioGroup {
	global Object clone() { }
	global Slack.TestHarness.Confirm getConfirm() { }
	global String getInitialValue() { }
	global String getName() { }
	global List<Slack.TestHarness.Option> getOptions() { }
	global String getValue() { }
	global void setValue(String identifier) { }
	global String toString() { }

}
global class Section {
	global Object clone() { }
	global Object getComponent(Integer idx, System.Type clazz) { }
	global Object getComponent(System.Type clazz) { }
	global Object getComponentByName(String name, System.Type clazz) { }
	global Integer getFieldCount() { }
	global String getFieldText(Integer idx) { }
	global String getName() { }
	global String getText() { }
	global String toString() { }

}
global class SelectInput {
	global Object clone() { }
	global Slack.TestHarness.Confirm getConfirm() { }
	global List<String> getInitialMultiselectValue() { }
	global String getInitialValue() { }
	global Integer getMaxSelection() { }
	global List<String> getMultiselectValue() { }
	global String getName() { }
	global List<Slack.TestHarness.OptionGroup> getOptionGroups() { }
	global List<Slack.TestHarness.Option> getOptions() { }
	global List<Slack.TestHarness.OptionGroup> getOptionsGroups() { }
	global String getPlaceholder() { }
	global String getValue() { }
	global Boolean isMultiselect() { }
	global void setMultiselectValue(List<String> listOfIdentifiers) { }
	global void setValue(String identifier) { }
	global String toString() { }

}
global class State {
	global void clearAllClientMocks() { }
	global void clearAppClientMock() { }
	global void clearBotClientMock() { }
	global void clearUserClientMock() { }
	global Object clone() { }
	global Slack.TestHarness.Channel createDirectChannel(Slack.TestHarness.User user) { }
	global Slack.TestHarness.Enterprise createEnterprise(String enterpriseId, String enterpriseName) { }
	global Slack.TestHarness.Enterprise createEnterprise(String enterpriseName) { }
	global Slack.TestHarness.Channel createPrivateChannel(Slack.TestHarness.Team team, String channelName, String locale) { }
	global Slack.TestHarness.Channel createPrivateChannel(Slack.TestHarness.Team team, String channelName) { }
	global Slack.TestHarness.Channel createPrivateChannel(String channelName) { }
	global Slack.TestHarness.Channel createPublicChannel(Slack.TestHarness.Team team, String channelName, String locale) { }
	global Slack.TestHarness.Channel createPublicChannel(Slack.TestHarness.Team team, String channelName) { }
	global Slack.TestHarness.Channel createPublicChannel(String channelName) { }
	global Slack.TestHarness.Team createTeam(String teamDomain, Slack.TestHarness.Enterprise enterprise) { }
	global Slack.TestHarness.Team createTeam(String teamDomain) { }
	global Slack.TestHarness.User createUser(String username, String name, Slack.TestHarness.Team team, String locale) { }
	global Slack.TestHarness.User createUser(String username, String name, Slack.TestHarness.Team team) { }
	global Slack.TestHarness.User createUser(String username, String name) { }
	global Slack.TestHarness.UserSession createUserSession(Slack.TestHarness.User user, Slack.TestHarness.Channel defaultChannel) { }
	global Slack.TestHarness.UserSession createUserSession() { }
	global Slack.TestHarness.Channel getChannel(Slack.TestHarness.Team team, String channelId) { }
	global List<Slack.TestHarness.Channel> getChannels(Slack.TestHarness.Team team) { }
	global Slack.TestHarness.Channel getDefaultChannel() { }
	global Slack.TestHarness.Enterprise getDefaultEnterprise() { }
	global Slack.TestHarness.Team getDefaultTeam() { }
	global Slack.TestHarness.User getDefaultUser() { }
	global String getLocale() { }
	global Slack.TestHarness.User getUser(Slack.TestHarness.Team team, String userId) { }
	global Slack.TestHarness.User getUserByUsername(Slack.TestHarness.Team team, String username) { }
	global List<Slack.TestHarness.User> getUsers(Slack.TestHarness.Team team) { }
	global void setAppClientMock(Slack.AppClientMock appClientMock) { }
	global void setBotClientMock(Slack.BotClientMock botClientMock) { }
	global void setLocale(String locale) { }
	global void setUserClientMock(Slack.UserClientMock userClientMock) { }
	global String toString() { }

}
global class Team {
	global Object clone() { }
	global List<Slack.TestHarness.Channel> getChannels() { }
	global Slack.TestHarness.Enterprise getEnterprise() { }
	global String getId() { }
	global String getTeamDomain() { }
	global String toString() { }

}
global class Text {
	global Object clone() { }
	global String getText() { }
	global String toString() { }

}
global class TextInput {
	global Object clone() { }
	global String getInitialValue() { }
	global Integer getMaxLength() { }
	global Integer getMinLength() { }
	global String getName() { }
	global String getPlaceholder() { }
	global String getValue() { }
	global Boolean isMultiline() { }
	global void setValue(String value) { }
	global String toString() { }

}
global class TimePicker {
	global Object clone() { }
	global Slack.TestHarness.Confirm getConfirm() { }
	global String getInitialValue() { }
	global String getName() { }
	global String getPlaceholder() { }
	global String getValue() { }
	global void setValue(String value) { }
	global String toString() { }

}
global class User {
	global Object clone() { }
	global String getId() { }
	global String getLocale() { }
	global String getName() { }
	global Slack.TestHarness.Team getTeam() { }
	global String getUsername() { }
	global String toString() { }

}
global class UserSession {
	global Object clone() { }
	global void closeAllModals() { }
	global void closeModal() { }
	global void executeEvent(Slack.Event event, Slack.App slackApp) { }
	global void executeGlobalShortcut(String globalShortcut, Slack.App slackApp) { }
	global void executeMessageShortcut(String messageShortcut, Slack.TestHarness.Message message, Slack.App slackApp) { }
	global void executeSlashCommand(String command, String text, Slack.App slackApp) { }
	global void executeSlashCommand(String command, Slack.App slackApp) { }
	global Slack.TestHarness.Home getAppHome() { }
	global Integer getMessageCount() { }
	global List<Slack.TestHarness.Message> getMessages() { }
	global List<Slack.TestHarness.Modal> getModalStack() { }
	global Slack.TestHarness.Channel getOpenChannel() { }
	global Slack.TestHarness.State getState() { }
	global Slack.TestHarness.Modal getTopModal() { }
	global Slack.TestHarness.User getUser() { }
	global Slack.TestHarness.Home openAppHome(Slack.App slackApp) { }
	global Slack.TestHarness.Channel openChannel(String channelId) { }
	global Slack.TestHarness.Message postMessage(String message) { }
	global String toString() { }

}
global class UsersSelect {
	global Object clone() { }
	global Slack.TestHarness.Confirm getConfirm() { }
	global List<String> getInitialMultiselectValue() { }
	global String getInitialValue() { }
	global Integer getMaxSelection() { }
	global List<String> getMultiselectValue() { }
	global String getName() { }
	global List<Slack.TestHarness.Option> getOptions() { }
	global String getPlaceholder() { }
	global String getValue() { }
	global Boolean isMultiselect() { }
	global void setMultiselectValue(List<String> listOfIdentifiers) { }
	global void setValue(String identifier) { }
	global String toString() { }

}

}
class Employee {
	priority: Priority;
	apiCount: APICount;
	agentCount: AgentCount;
	interfaces: Interfaces;
	butler: Butler;

	constructor() {
		this.priority = new Priority();
		this.apiCount = new APICount();
		this.agentCount = new AgentCount();
		this.interfaces = new Interfaces();
		this.butler = new Butler();
	}
}

class Order {
	priority: Priority;
	apiCount: APICount;
	agentCount: AgentCount;
	interfaces: Interfaces;
	butler: Butler;

	constructor() {
		this.priority = new Priority();
		this.apiCount = new APICount();
		this.agentCount = new AgentCount();
		this.interfaces = new Interfaces();
		this.butler = new Butler();
	}
}
class API { }
class Url { }
class Butler { }


class Interfaces {
	api: API;
	url: Url;

	constructor() {
		this.api = new API();
		this.url = new Url();
	}

}

class LogBook {

}

class Logger {

}

class Visibility {

}

class SensitiveVisibility {

}

class TaskQueue {
	queue = new CircularQueue<number>(3);


}
class Priority { }
class APICount { }
class AgentCount { }

class Core {

	public daemonInterval: number = 5000;
	public status: String = 'ONLINE';
	/* List of Watchers : MOBILITYUNIT, ATTENDANCE, HR, CALENDAR, MEETING, EMAIL, CHAT, VCS, BUILDTESTER, PROJECTMANAGEMENTTOOL, CODEREVIEWTOOL, TECHNICALDOCUMENTATION */


	public watchers: Watcher[] = [
		new Watcher('MOBILITYUNIT'),
		new Watcher('ATTENDANCE'),
		new Watcher('HR'),
		new Watcher('CALENDAR'),
		new Watcher('MEETING'),
		new Watcher('EMAIL'),
		new Watcher('CHAT'),
		new Watcher('VCS'),
		new Watcher('BUILDTESTER'),
		new Watcher('PROJECTMANAGEMENTTOOL'),
		new Watcher('CODEREVIEWTOOL'),
		new Watcher('TECHNICALDOCUMENTATION')
	  ];

	public tasks = new TaskQueue();
	public taskMaker = new TaskMaker();
	public apsis = new APSIS();
	public priorityqueue = new PriorityOrder();
	public gui = new GUI("A","B");
	public butler = new Butler();

	public mailingLists: {
		family: Employee[];
		'Reporting Managers': Employee[];
		MyTeamMembers: Employee[];
		'Other Team Members': Employee[];
		'IT and Support TMs': Employee[];
		HR: Employee[];
		BUSINESS: Employee[];
		'Govt.Partners': Employee[];
	} = {
			family: [],
			'Reporting Managers': [],
			MyTeamMembers: [],
			'Other Team Members': [],
			'IT and Support TMs': [],
			HR: [],
			BUSINESS: [],
			'Govt.Partners': []
		};

	public orderLists: {
		'YOGA': Order[];
		'CALENDAR': Order[];
		'Desk': Order[];
		'MEETING': Order[];
		'CUSTOMER': Order[];
		'PRESENTATION': Order[];
		'MyTraining+Certifications': Order[];
		'Govt': Order[];
		'Conference': Order[];
		'Interviewing': Order[];
		'Informal': Order[];
		'CUSTOMERREQUIREMENTS': Order[];
		'REQUIREMENTS': Order[];
		'STRUCTUREDREQUIREMENTS': Order[];
		'STAKEHOLDERSREQUIREMENTS': Order[];
		'REPORTINGMANAGER': Order[];
		'PROBLEMSTATEMENT': Order[];
		'STRUCTUREDPROBLEMSTATEMENT': Order[];
		'SOLUTIONSTATEMENT': Order[];
		'STRUCTUREDSOLUTIONSTATEMENT': Order[];
		'MESSAGE': Order[];
		'SOLVENT': Order[];
	} = {
			'YOGA': [],
			'CALENDAR': [],
			'Desk': [],
			'MEETING': [],
			'CUSTOMER': [],
			'PRESENTATION': [],
			'MyTraining+Certifications': [],
			'Govt': [],
			'Conference': [],
			'Interviewing': [],
			'Informal': [],
			'CUSTOMERREQUIREMENTS': [],
			'REQUIREMENTS': [],
			'STRUCTUREDREQUIREMENTS': [],
			'STAKEHOLDERSREQUIREMENTS': [],
			'REPORTINGMANAGER': [],
			'PROBLEMSTATEMENT': [],
			'STRUCTUREDPROBLEMSTATEMENT': [],
			'SOLUTIONSTATEMENT': [],
			'STRUCTUREDSOLUTIONSTATEMENT': [],
			'MESSAGE': [],
			'SOLVENT': [],
		};

	public interfaceLists: {
		'EMAIL': Interfaces[];
		'Chat': Interfaces[];
		'VIRTUALMEETING': Interfaces[];
		'MEETING': Interfaces[];
		'ProjectMaintenance': Interfaces[];
		'VCS': Interfaces[];
		'IDE': Interfaces[];
		'Calendar': Interfaces[];
		'HR': Interfaces[];
		'Presentation': Interfaces[];
		'UserGuides': Interfaces[];
		'InternalDeveloperGuides': Interfaces[];
		'ATTENDENCE': Interfaces[];
		'PATENTS': Interfaces[];
		'PUBLICATIONS': Interfaces[];
		'INTERNALRESEARCH': Interfaces[];
		'INTERNETRESEARCH': Interfaces[];
	} = {
			'EMAIL': [],
			'Chat': [],
			'VIRTUALMEETING': [],
			'MEETING': [],
			'ProjectMaintenance': [],
			'VCS': [],
			'IDE': [],
			'Calendar': [],
			'HR': [],
			'Presentation': [],
			'UserGuides': [],
			'InternalDeveloperGuides': [],
			'ATTENDENCE': [],
			'PATENTS': [],
			'PUBLICATIONS': [],
			'INTERNALRESEARCH': [],
			'INTERNETRESEARCH': [],
		};


	constructor(yamlFile: string) {

	}

	public READ(): void {

		console.log(this.daemonInterval);
	}

	public updatePriorityQueue(): void {
		console.log(this.daemonInterval);
	}

	public updateGUI(): void {
		console.log(this.daemonInterval);
	}

	public updateAPSISNASC(): void {
		console.log(this.daemonInterval);
	}

	public UPDATE(): void {
		this.updateAPSISNASC();
		this.updatePriorityQueue();
		this.updateGUI();
	}

	public daemon(): void {
		// Use the public variable inside the function
		const interval = setInterval(() => {
			this.READ();
			this.UPDATE();
		}, this.daemonInterval);

		// clearInterval(interval);
		console.log(this.daemonInterval);
	}

}

class EngineMatrix {
	ruleList: string[] = ['Token (Word[Punctuation])', 'Level', 'Priority Business', 'Priority Self', 'Complexity', 'Clarity', 'Definition', 'Example', 'Clarification', 'Reference', 'Dependency IN', 'Dependency Out', 'Action', 'Score', 'Nouns', 'Verbs', 'Active-Passive', 'Adverbs/Adjectives', 'Prepositions', 'Conjunctions', 'Interjection', 'Tense', 'Conditionals', 'Subject-Verb Agreement', 'Determiners', 'Qunatifiers', 'Auxillery Verb Do', 'Questionn', 'Affirmation', 'Negation', 'Comparatives', 'Negative Agrement', 'Direct Object', 'Indirect Object', 'Causative Verb', 'Embedded Question', 'Subjective', 'Perfective', 'Emergency', 'Inquiry', 'Enquiry/General/Other', 'HR', 'Command', 'Cost To Company', 'Compensation', 'Reimbursement', 'Task Update', 'Task Id', 'Task Name', 'Menial', 'Problem', 'Query[O]', 'Location', 'Standard Time', 'ETA', 'Customer', 'Interviewee', 'Customer Feedback', 'Interview Feedback', 'Requirements', 'Business Requirements', 'Organisation', 'Work', 'Technical Debt/Update', 'Managerial', 'Logistics', 'Research(& -Outlook)', 'Outlook', 'Outreach', 'Sell Opportunity', 'Seniors', 'Stakeholders', 'Visibility', 'Medical', 'Monetary/Private', 'Confidential(Patents/Licenses/Publications', 'Problem', 'Log Update', 'Source', 'Data Store (Other than the org Email)', 'Sink', 'Code Review', 'Code Standard', 'SDLC Standard', 'Engineering Standard', 'Standards', 'Protocol', 'Employment Status', 'Upgrade', 'Degrade', 'Govt./Environmental', 'Mathematical', 'Analytical', 'Numerical', 'Scientific', 'Methodology', 'Physical', 'Chemical', 'Biological', 'Problem Solving', 'Coding', 'SDLC', 'Engineering', 'Request[O]', 'Delegate[IN]', 'Delegate[O]', 'Intellectual Property', 'Elaborate(Query for Problem Solving)', 'Define(QPS)', 'Clarify(QPS)', 'Example(QPS)', 'References(QPS)', 'Review(QPS)', 'Note(QPS)', 'Advice(QPS)', 'Query aka doubt (QPS)', 'Quantities with their Units (QPS)', 'Feature Requirements (QPS)', 'Business Requirements (QPS)', 'Interface(QPS)', 'I/O (QPS)', 'Explanation(QPS)', 'Algorithm(QPS)', 'Codebase Walktrhough', 'Architecture Walkthrough', 'Technical Update Walkthrough'];


}

class Tokenizer { }

class EngineGeneratorPerToken { }

class Architect {
	interfaces: Interfaces;
	butler: Butler;

	constructor() {
		this.interfaces = new Interfaces();
		this.butler = new Butler();
	}
}
class ArchitectConcepts {//ExternalAPIs

	Concepts: {
		'LocalAiInEditorIntelligentComplete': Architect[];
		'FullCodeBaseAIAssistant': Architect[];
		'GoodQualityLocalCodeAssistant': Architect[];
		'AITestCasesGenerator': Architect[];
		'AICodeReviewer': Architect[];
		'AICodeSecurityCheck': Architect[];
		'AIProjectManagementAssistant': Architect[];
		'AICommentGenerator/Writer': Architect[];
		'AITechnicalDocumentationGenerator/Writer': Architect[];
		'AICodeReviewOnVCS': Architect[];
		'AITechnicalDebtManager': Architect[];
		'AIMeetingAssistant': Architect[];
		'VCS': Architect[];
		'PROJECTMANAGEMENTTOOL': Architect[];
		'BUILDTESTTOOL': Architect[];
		'CODEANALYSISTOOL': Architect[];
		'OTHERPROJECTTOOL': Architect[];
		'TEXTANALYSISTOOL': Architect[];
		'DATAANALYSISTOOL': Architect[];
		'EMAIL': Architect[];
		'PrimaryChat': Architect[];
		'HR': Architect[];
		'BUSINESS': Architect[];
		'Govt.Partners': Architect[];
	} = {
			'LocalAiInEditorIntelligentComplete': [],
			'FullCodeBaseAIAssistant': [],
			'GoodQualityLocalCodeAssistant': [],
			'AITestCasesGenerator': [],
			'AICodeReviewer': [],
			'AICodeSecurityCheck': [],
			'AIProjectManagementAssistant': [],
			'AICommentGenerator/Writer': [],
			'AITechnicalDocumentationGenerator/Writer': [],
			'AICodeReviewOnVCS': [],
			'AITechnicalDebtManager': [],
			'AIMeetingAssistant': [],
			'VCS': [],
			'PROJECTMANAGEMENTTOOL': [],
			'BUILDTESTTOOL': [],
			'CODEANALYSISTOOL': [],
			'OTHERPROJECTTOOL': [],
			'TEXTANALYSISTOOL': [],
			'DATAANALYSISTOOL': [],
			'EMAIL': [],
			'PrimaryChat': [],
			'HR': [],
			'BUSINESS': [],
			'Govt.Partners': [],
		};
}


class Message {
	text: Texts;
	data: Data;

	constructor(text: Texts, data: Data) {
		this.text = text;
		this.data = data;
	}
}
//TODO: Pick the highest priority top 100 tasks via the Task Maker and have a 100 size priority queue for the tasks, TaskMaker and Priority Score calcualtor and assigner left
class MessagePassVerification {

}

class MessagePassing {

}

class Calculator {
	// Math
}

class Stakeholder {
	/* (Order, Employees, MailingLists) */
}


class Protocol {
	/* Protocol is defined as follows: [From: Stakeholder, To: Stakeholder, Interface, Message, Verification) */

	From: Stakeholder;
	To: Stakeholder;
	Inf: Interfaces;
	Msg: Message;
	Verify: MessagePassVerification;

	constructor(
		from: Stakeholder,
		to: Stakeholder,
		inf: Interfaces,
		msg: Message,
		verify: MessagePassVerification
	) {
		this.From = from;
		this.To = to;
		this.Inf = inf;
		this.Msg = msg;
		this.Verify = verify;
	}
}

class TextsToSpeechAndSpeechToTexts {

}

class Watcher {
name : string;
constructor(name: string) {
	this.name = name;
}
}

class TaskMaker {

}


type Carrier =
	| { propx50: string; }
	| { propx51: number; }
	| { propx52: boolean; }
	| { propx0: Employee }
	| { propx1: Order }
	| { propx2: API }
	| { propx3: Url }
	| { propx4: Butler }
	| { propx5: Interfaces }
	| { propx6: LogBook }
	| { propx7: Logger }
	| { propx8: Visibility }
	| { propx9: SensitiveVisibility }
	| { propx10: Priority }
	| { propx11: APICount }
	| { propx12: AgentCount }
	| { propx13: Core }
	| { propx14: EngineMatrix }
	| { propx15: Tokenizer }
	| { propx16: EngineGeneratorPerToken }
	| { propx17: Architect }
	| { propx18: ArchitectConcepts }
	| { propx19: Message }
	| { propx20: MessagePassVerification }
	| { propx21: MessagePassing }
	| { propx22: Calculator }
	| { propx23: Stakeholder }
	| { propx24: Protocol }
	| { propx25: TextsToSpeechAndSpeechToTexts }
	| { propx26: MailingList }
	| { propx27: ChatThread }
	| { propx28: NASC }
	| { propx29: Task }
	| { propx30: AlgorithmDeveloper }
	| { propx31: AlgorithmPseudoCoder }
	| { propx32: Coder }
	| { propx33: Programer }
	| { propx34: doubleWModelTasker }
	| { propx35: doubleWModelVerifier }
	| { propx36: doubleWModel }
	| { propx37: dataStore }
	| { propx38: DataStores }
	| { propx39: Texts }
	| { propx40: Data }
	| { propx41: Depth }
	| { propx42: urlBFSDepthAdaptiveScraper }
	| { propx43: CalendarGUI }
	| { propx44: PriorityGUI }
	| { propx45: GUI }
	| { propx46: ProblemStandardizer }
	| { propx47: SolutionStandardizer }
	| { propx48: ProblemSolver }
	| { propx49: Watcher }
	| { propx50: TaskMaker }
	| { propx54: TaskQueue };;




class MailingList {

}

class ChatThread {

}

class NASC {
	employees: Employee[];
	mailinglists: MailingList[];
	interfaces: Interfaces[];

	order: Order;
	butler: Butler;
	protocol: Protocol;

	constructor() {
		this.employees = []; // Initialize the employees array to an empty array
		this.mailinglists = [];
		this.interfaces = [];

		this.order = new Order();
		this.butler = new Butler();
		this.protocol = new Protocol(1, 2, new Interfaces(), new Message(new API(), new Url()), 5);
	}


}

class PriorityQueue<T> {
	private elements: { priority: number; value: T }[];

	constructor() {
	  this.elements = [];
	}

	enqueue(value: T, priority: number) {
	  this.elements.push({ priority, value });
	  this.elements.sort((a, b) => a.priority - b.priority);
	}

	dequeue(): T | undefined {
	  return this.elements.shift()?.value;
	}

	isEmpty(): boolean {
	  return this.elements.length === 0;
	}

	peek(): T | undefined {
	  return this.elements[0]?.value;
	}
  }

  class CircularQueue<T> {
	private elements: (T | undefined)[];
	private front: number;
	private rear: number;
	private size: number;

	constructor(size: number) {
	  this.elements = new Array(size);
	  this.front = -1;
	  this.rear = -1;
	  this.size = size;
	}

	enqueue(value: T) {
	  const nextRear = (this.rear + 1) % this.size;

	  if (this.front === -1 && this.rear === -1) {
		this.front = 0;
		this.rear = 0;
	  } else if (nextRear === this.front) {
		throw new Error("Queue is full");
	  } else {
		this.rear = nextRear;
	  }

	  this.elements[this.rear] = value;
	}

	dequeue(): T | undefined {
	  if (this.front === -1 && this.rear === -1) {
		throw new Error("Queue is empty");
	  }

	  const value = this.elements[this.front];
	  this.elements[this.front] = undefined;

	  if (this.front === this.rear) {
		this.front = -1;
		this.rear = -1;
	  } else {
		this.front = (this.front + 1) % this.size;
	  }

	  return value;
	}

	isEmpty(): boolean {
	  return this.front === -1 && this.rear === -1;
	}

	isFull(): boolean {
	  return (this.rear + 1) % this.size === this.front;
	}

	peek(): T | undefined {
	  if (this.front === -1 && this.rear === -1) {
		throw new Error("Queue is empty");
	  }

	  return this.elements[this.front];
	}
  }

class Task {

}

class AlgorithmDeveloper {

}


class AlgorithmPseudoCoder {

}

class Coder {


}

class Programer {

}

class doubleWModelTasker {

}

class doubleWModelVerifier {

}


class doubleWModel {
	//core: Core;
	engineMatrix: EngineMatrix;
	tasker: doubleWModelTasker;
	verifier: doubleWModelVerifier;
	//architectConcepts: ArchitectConcepts;
	//nasc: NASC;

	constructor() {
		//this.core = new Core();
		this.engineMatrix = new EngineMatrix();
		this.tasker = new doubleWModelTasker();
		this.verifier = new doubleWModelVerifier();
		//this.architectConcepts = new ArchitectConcepts();
		//this.nasc = new NASC();
	}
}

class dataStore {

}

class DataStores {
	employees: dataStore[];
	orders: dataStore[];
	apis: dataStore[];
	urls: dataStore[];
	butlers: dataStore[];
	priorities: dataStore[];
	apiCounts: dataStore[];
	agentCounts: dataStore[];
	interfaces: dataStore[];
	architects: dataStore[];
	interviewees: dataStore[];
	//: EngineMatrix[];
	//architectConcepts: ArchitectConcepts[];
	//nascs: NASC[];

	constructor() {
		this.employees = [];
		this.orders = [];
		this.apis = [];
		this.urls = [];
		this.butlers = [];
		this.priorities = [];
		this.apiCounts = [];
		this.agentCounts = [];
		this.interfaces = [];
		this.architects = [];
		this.interviewees = [];
		//this.cores
	}
}

class Texts {

	//2D Array(Matrix)

}

class Data {
	//ND Array(Matrix)
}

class Depth {

}

class urlBFSDepthAdaptiveScraper {
	depth: Depth;
	url: Url;
	text: Texts;
	data: Data;

	constructor() {
		this.depth = new Depth();
		this.url = new Url();
		this.text = new Texts();
		this.data = new Data();
	}

}

class CalendarGUI {
	//from calendar.vim
}

class PriorityGUI {
	//from safe eyes
}


class GUI {
	normal: CalendarGUI;
	urgent: PriorityGUI;

	constructor(normal: CalendarGUI, urgent: PriorityGUI) {
		this.normal = normal;
		this.urgent = urgent;
	}
}

class ProblemStandardizer {

}
class SolutionStandardizer {

}

class ProblemSolver {

}


class APSIS {

	security: NASC;
	emergency: NASC;
	medical: NASC;
	financial: NASC;
	mobility: NASC;
	government: NASC;
	hr: NASC;
	business: NASC;
	reportingmanager: NASC;
	performance: NASC;
	attendance: NASC;
	meetings: NASC;
	projectbuilds: NASC;
	projectmanagement: NASC;
	livetranscribe: NASC;
	texttospeech: NASC;
	calendar: NASC;
	email: NASC;
	alarms: NASC;
	reminders: NASC;
	personalassistant: NASC;
	officewayfinder: NASC;
	officeassistant: NASC;
	presenter: NASC;
	juniormanager: NASC;
	legal: NASC;
	internalbusinessakainvestments: NASC;
	externalbusiness: NASC;
	mother: NASC;
	father: NASC;
	family: NASC;
	Spouse: NASC;
	children: NASC;
	blockdiagramsandsignalflowgraphs: NASC;
	blueexecutivecsuite: NASC;
	observeyourbreathandsolvetheproblem: NASC;

	constructor() {
		this.security = new NASC();
		this.emergency = new NASC();
		this.medical = new NASC();
		this.financial = new NASC();
		this.mobility = new NASC();
		this.government = new NASC();
		this.hr = new NASC();
		this.business = new NASC();
		this.reportingmanager = new NASC();
		this.performance = new NASC();
		this.attendance = new NASC();
		this.meetings = new NASC();
		this.projectbuilds = new NASC();
		this.projectmanagement = new NASC();
		this.livetranscribe = new NASC();
		this.texttospeech = new NASC();
		this.calendar = new NASC();
		this.email = new NASC();
		this.alarms = new NASC();
		this.reminders = new NASC();
		this.personalassistant = new NASC();
		this.officewayfinder = new NASC();
		this.officeassistant = new NASC();
		this.presenter = new NASC();
		this.juniormanager = new NASC();
		this.legal = new NASC();
		this.internalbusinessakainvestments = new NASC();
		this.externalbusiness = new NASC();
		this.mother = new NASC();
		this.father = new NASC();
		this.family = new NASC();
		this.Spouse = new NASC();
		this.children = new NASC();
		this.blockdiagramsandsignalflowgraphs = new NASC();
		this.blueexecutivecsuite = new NASC();
		this.observeyourbreathandsolvetheproblem = new NASC();
	}




}



class PriorityOrder {
	queue = new PriorityQueue<number>();


	//Rayleigh Graph/Plot
}

class HoloGraph {

	/*READ VALUES FROM AND WRITE VALUES TO A CONFIG FILE ., FOR EX. YAML FILE: HERE it is holographconfig.yml*/

	/*Employees and Orders AND MailingLists, corresponding interfaces, data stroes, apis and urls - Come from the YAML - holographconfig.yml */


	core: Core;


	constructor() {
		this.core = new Core('./holographconfig.yml');
		//this.priorityqueue = new PriorityOrder();

	}



apsis() {
	this.core.daemon();

}

}

function holograph() {
	const serve = new HoloGraph();
	serve.apsis();
}

holograph();


















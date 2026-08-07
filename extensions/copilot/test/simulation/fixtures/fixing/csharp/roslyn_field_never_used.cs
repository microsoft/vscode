using System;
using System.Collections;
using System.Collections.Generic;

namespace Test.Rename.Dll {
	static class g {
		static public T m<T>(T t) {
			return t;
		}

		public delegate void Func1();
	}

	namespace test.events.Virtual {
		class Class1 {
			public virtual event g.Func1? event1;
			public virtual event g.Func1? event2;
			protected virtual event g.Func1? event3;
			protected virtual event g.Func1? event4;
		}
		class Class2 : Class1 {
			public override event g.Func1? event1;
			public override event g.Func1? event2;
			protected override event g.Func1? event3;
			protected override event g.Func1? event4;
		}
		class Class3 : Class1 {
			public override event g.Func1? event1;
			public override event g.Func1? event2;
			protected override event g.Func1? event3;
			protected override event g.Func1? event4;
		}
	}

	namespace test.events.Virtual.newslot {
		class Class1 {
			public virtual event g.Func1? event1;
			public virtual event g.Func1? event2;
			protected virtual event g.Func1? event3;
			protected virtual event g.Func1? event4;
		}
		class Class2 : Class1 {
			public new virtual event g.Func1? event1;
			public new virtual event g.Func1? event2;
			protected new virtual event g.Func1? event3;
			protected new virtual event g.Func1? event4;
		}
		class Class3 : Class1 {
			public new virtual event g.Func1? event1;
			public new virtual event g.Func1? event2;
			protected new virtual event g.Func1? event3;
			protected new virtual event g.Func1? event4;
		}
	}

	namespace test.events.Abstract {
		abstract class Class1 {
			public abstract event g.Func1? event1;
			public abstract event g.Func1? event2;
			protected abstract event g.Func1? event3;
			protected abstract event g.Func1? event4;
		}
		class Class2 : Class1 {
			public override event g.Func1? event1;
			public override event g.Func1? event2;
			protected override event g.Func1? event3;
			protected override event g.Func1? event4;
		}
		class Class3 : Class1 {
			public override event g.Func1? event1;
			public override event g.Func1? event2;
			protected override event g.Func1? event3;
			protected override event g.Func1? event4;
		}
	}
}

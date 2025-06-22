#include <napi.h>

#include <sstream>
#include <stack>
#include <string>
#include <vector>

#include "ffrAPI.h"

//
// NOVAS_FSDB is internally used in NOVAS
//
#ifdef NOVAS_FSDB
#undef NOVAS_FSDB
#endif

#ifndef TRUE
const int TRUE = 1;
#endif

#ifndef FALSE
const int FALSE = 0;
#endif

static void __DumpScope(fsdbTreeCBDataScope *scope);
static void __DumpVar(fsdbTreeCBDataVar *var);
static void __DumpArray(fsdbTreeCBDataArrayBegin *array);
static void __EndArray();
static bool_T MyTreeCB(fsdbTreeCBType cb_type, void *client_data,
                       void *tree_cb_data);
static void __PrintTimeValChng(ffrVCTrvsHdl vc_trvs_hdl, fsdbTag64 *time,
                               byte_T *vc_ptr, const Napi::CallbackInfo &info,
                               Napi::Array &result, double &min, double &max);

std::string fsdb_name;

ffrObject *fsdb_obj = nullptr;

// Logical offsets in scope 'Top'
static std::vector<fsdbLUOff> scope_offset;

static std::vector<std::string> module_path_stack;
static std::string module_path;
static std::stack<uint_T> arraysize_stack;

// Not using atomic here. Note that we assume all addon call will be
// synchronous, put "await" for all addon calls if not sure what you're doing
unsigned int netlistId = 0;
Napi::Env env_global = nullptr;

// Object from node.js area
Napi::Function fsdbScopeCallback;
Napi::Function fsdbUpscopeCallback;
Napi::Function fsdbVarCallback;
Napi::Function fsdbArrayBeginCallback;
Napi::Function fsdbArrayEndCallback;


bool CHECK_LENGTH(const Napi::Env& env, const Napi::CallbackInfo &info, size_t size) {
  if (info.Length() < size) {
    Napi::TypeError::New(env, "Incorrect number of arguments")
        .ThrowAsJavaScriptException();
    return false;
  }
  return true;
}

bool CHECK_STRING(const Napi::Env& env, const Napi::Value &value) {
  if (!value.IsString()) {
    Napi::TypeError::New(env, "Expected string").ThrowAsJavaScriptException();
    return false;
  }
  return true;
}

bool CHECK_NUMBER(const Napi::Env& env, const Napi::Value &value) {
  if (!value.IsNumber()) {
    Napi::TypeError::New(env, "Expected number").ThrowAsJavaScriptException();
    return false;
  }
  return true;
}

bool CHECK_FUNCTION(const Napi::Env& env, const Napi::Value &value) {
  if (!value.IsFunction()) {
    Napi::TypeError::New(env, "Expected function").ThrowAsJavaScriptException();
    return false;
  }
  return true;
}

bool CHECK_ARRAY(const Napi::Env& env, const Napi::Value &value) {
  if (!value.IsArray()) {
    Napi::TypeError::New(env, "Expected array").ThrowAsJavaScriptException();
    return false;
  }
  return true;
}

void openFsdb(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (!CHECK_LENGTH(env, info, 1)) return;
  if (!CHECK_STRING(env, info[0])) return;

  fsdb_name = info[0].As<Napi::String>();
  char *buffer = fsdb_name.data();

  fsdbRC rc = ffrObject::ffrCheckFile(buffer);
  if (rc == FSDB_RC_FILE_DOES_NOT_EXIST) {
    Napi::TypeError::New(env, "File not exist.").ThrowAsJavaScriptException();
    return;
  } else if (rc == FSDB_RC_FILE_IS_NOT_READABLE) {
    Napi::TypeError::New(env, "File not readable.")
        .ThrowAsJavaScriptException();
    return;
  } else if (rc == FSDB_RC_FILE_IS_A_DIRECTORY) {
    Napi::TypeError::New(env, "Is directory, not a FSDB.")
        .ThrowAsJavaScriptException();
    return;
  }

  if (FALSE == ffrObject::ffrIsFSDB(buffer)) {
    Napi::TypeError::New(env, "File is not FSDB.").ThrowAsJavaScriptException();
    return;
  }

  fsdb_obj = ffrObject::ffrOpen3(buffer);
  if (nullptr == fsdb_obj) {
    Napi::TypeError::New(env, "ffrObject::ffrOpen() failed.")
        .ThrowAsJavaScriptException();
    return;
  }
}

void readScopes(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  env_global = env;
  if (!CHECK_LENGTH(env, info, 2)) return;
  if (!CHECK_FUNCTION(env, info[0])) return;
  if (!CHECK_FUNCTION(env, info[1])) return;

  fsdbScopeCallback = info[0].As<Napi::Function>();
  fsdbUpscopeCallback = info[1].As<Napi::Function>();

  fsdb_obj->ffrSetTreeCBFunc(MyTreeCB, NULL);
  fsdb_obj->ffrReadScopeTree();
}

ulong_T combineTime(uint_T H, uint_T L) {
  return (static_cast<ulong_T>(H) << 32) + L;
}

void readMetadata(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (!CHECK_LENGTH(env, info, 2)) return;
  if (!CHECK_FUNCTION(env, info[0])) return;
  if (!CHECK_FUNCTION(env, info[1])) return;

  Napi::Function setMetadata = info[0].As<Napi::Function>();
  Napi::Function setChunkSize = info[1].As<Napi::Function>();

  uint_T digit;
  char *unit;
  str_T scale_unit = fsdb_obj->ffrGetScaleUnit();
  fsdb_obj->ffrExtractScaleUnit(scale_unit, digit, unit);

  std::vector<Napi::Value> args;
  // scopecount: number
  args.push_back(Napi::Number::New(env, scope_offset.size()));
  // varcount: number (not used in fsdb)
  args.push_back(Napi::Number::New(env, 0));
  args.push_back(Napi::Number::New(env, digit));  // timescale: number
  args.push_back(Napi::String::New(env, unit));   // timeunit: string
  setMetadata.Call(args);

  fsdbTag64 max_time;
  if (FSDB_RC_FAILURE == fsdb_obj->ffrGetMaxFsdbTag64(&max_time)) {
    Napi::TypeError::New(env, "ffrGetMaxFsdbTag64() failed")
        .ThrowAsJavaScriptException();
    return;
  }
  ulong_T end_time = combineTime(max_time.H, max_time.L);

  // NOTE: traverse flush session is slow in some case.
  //
  // The FSDB Writer writes out value changes when buffer is full and this is
  // called a flush session. This is heuristic to make each chunk contains at
  // least 1/10 of value changes in a flush session.
  // ulong_T min_session_length = 9999999;
  // ffrSessionInfo *session_info;
  // do {
  //   session_info = fsdb_obj->ffrGetSessionListInfo();
  //   ulong_T close_time = combineTime(session_info->close_xtag.hltag.H,
  //                                    session_info->close_xtag.hltag.L);
  //   ulong_T start_time = combineTime(session_info->start_xtag.hltag.H,
  //                                    session_info->start_xtag.hltag.L);
  //   min_session_length = std::min(min_session_length, close_time -
  //   start_time); session_info = session_info->next;
  // } while (session_info != NULL);
  // ulong_T chunk_size = min_session_length / 10;

  std::vector<Napi::Value> args2;
  // args2.push_back(Napi::Number::New(env, chunk_size));
  // chunk_size is not used in the new canvas renderer, just give it random
  // number (500)
  args2.push_back(Napi::Number::New(env, 500));
  args2.push_back(Napi::Number::New(env, end_time));
  setChunkSize.Call(args2);
}

void readVars(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  env_global = env;
  if (!CHECK_LENGTH(env, info, 5)) return;
  if (!CHECK_STRING(env, info[0])) return;
  if (!CHECK_NUMBER(env, info[1])) return;
  if (!CHECK_FUNCTION(env, info[2])) return;
  if (!CHECK_FUNCTION(env, info[3])) return;
  if (!CHECK_FUNCTION(env, info[4])) return;

  module_path = info[0].As<Napi::String>();
  size_t scopeOffsetIdx =
      static_cast<size_t>(info[1].As<Napi::Number>().Uint32Value());
  fsdbVarCallback = info[2].As<Napi::Function>();
  fsdbArrayBeginCallback = info[3].As<Napi::Function>();
  fsdbArrayEndCallback = info[4].As<Napi::Function>();

  if (FSDB_RC_FAILURE ==
      fsdb_obj->ffrReadVarByLogUOff(&scope_offset[scopeOffsetIdx])) {
    Napi::TypeError::New(env, "ffrReadVarByLogUOff failed")
        .ThrowAsJavaScriptException();
    return;
  }
}

//
// NAME : MyTreeCB
//
// DESCRIPTION: A callback function used by fsdb reader
//
// PARAMETERS : See fsdb reader document.
//
// RETURN : See fsdb reader document.
//
static bool_T MyTreeCB(fsdbTreeCBType cb_type, void *client_data,
                       void *tree_cb_data) {
  fsdbTreeCBDataScope *pScope;
  // fsdbTreeCBDataUpscope *pUpscope;
  fsdbTreeCBDataVar *pVar;
  fsdbTreeCBDataArrayBegin *pArray;

  switch (cb_type) {
    case FSDB_TREE_CBT_BEGIN_TREE:
      // fprintf(stderr, "<BeginTree>\n");
      break;

    case FSDB_TREE_CBT_SCOPE:
      // The first time 'Top' is entered, record its logical offset.
      // Other logical offsets of 'Top' will be known when an
      // UPSCOPE sets the current traverse point to 'Top'.
      pScope = (fsdbTreeCBDataScope *)tree_cb_data;
      scope_offset.push_back(pScope->var_start_log_uoff);
      __DumpScope(pScope);
      break;

    case FSDB_TREE_CBT_UPSCOPE:
      // pUpscope = (fsdbTreeCBDataUpscope *)tree_cb_data;
      // scope_offset.push_back(pUpscope->var_start_log_uoff);
      // fprintf(stderr, "<Upscope>\n");

      fsdbUpscopeCallback.Call(std::vector<Napi::Value>());
      module_path_stack.pop_back();
      break;

    case FSDB_TREE_CBT_VAR:
      pVar = (fsdbTreeCBDataVar *)tree_cb_data;
      __DumpVar(pVar);
      break;

    case FSDB_TREE_CBT_END_TREE:
      // fprintf(stderr, "<EndTree>\n\n");
      break;

    case FSDB_TREE_CBT_ARRAY_BEGIN:
      pArray = (fsdbTreeCBDataArrayBegin *)tree_cb_data;
      __DumpArray(pArray);
      break;

    case FSDB_TREE_CBT_ARRAY_END:
      __EndArray();
      break;

    case FSDB_TREE_CBT_RECORD_BEGIN:
      // fprintf(stderr, "<BeginRecord>\n");
      break;

    case FSDB_TREE_CBT_RECORD_END:
      // fprintf(stderr, "<EndRecord>\n\n");
      break;

    case FSDB_TREE_CBT_STRUCT_BEGIN:
      break;

    case FSDB_TREE_CBT_STRUCT_END:
      break;

    case FSDB_TREE_CBT_FILE_TYPE:
      break;

    case FSDB_TREE_CBT_SIMULATOR_VERSION:
      break;

    case FSDB_TREE_CBT_SIMULATION_DATE:
      break;

    case FSDB_TREE_CBT_X_AXIS_SCALE:
      break;

    case FSDB_TREE_CBT_END_ALL_TREE:
      break;

    default:
      return TRUE;
  }

  return TRUE;
}

static std::string joinModulePath(std::vector<std::string> &module_path_stack) {
  if (module_path_stack.empty()) {
    return "";
  }
  std::ostringstream oss;
  oss << module_path_stack[0];  // Add the first item without a leading
                                // delimiter

  // Append the rest with a delimiter "."
  for (size_t i = 1; i < module_path_stack.size(); i++) {
    oss << "." << module_path_stack[i];
  }

  return oss.str();
}

static void __DumpScope(fsdbTreeCBDataScope *scope) {
  str_T type;

  switch (scope->type) {
    case FSDB_ST_VCD_MODULE:
      type = (str_T) "module";
      break;

    case FSDB_ST_VCD_TASK:
      type = (str_T) "task";
      break;

    case FSDB_ST_VCD_FUNCTION:
      type = (str_T) "function";
      break;

    case FSDB_ST_VCD_BEGIN:
      type = (str_T) "begin";
      break;

    case FSDB_ST_VCD_FORK:
      type = (str_T) "fork";
      break;

    default:
      type = (str_T) "unknown_scope_type";
      break;
  }

  // fprintf(stderr, "<Scope> name:%s  type:%s\n", scope->name, type);

  module_path_stack.push_back(scope->name);
  std::string path = joinModulePath(module_path_stack);

  std::vector<Napi::Value> args;
  args.push_back(Napi::String::New(env_global, scope->name));
  args.push_back(Napi::String::New(env_global, type));
  args.push_back(Napi::String::New(env_global, path));
  args.push_back(Napi::Number::New(env_global, netlistId));
  args.push_back(Napi::Number::New(env_global, scope_offset.size() - 1));
  fsdbScopeCallback.Call(args);
  netlistId++;
}

static void __DumpVar(fsdbTreeCBDataVar *var) {
  str_T type;
  //   str_T bpb;

  // encoding should be "String", "Real" or "BitVector"
  // check https://github.com/ekiwi/wellen for details
  //    TODO(heyfey): figure out missing encoding
  std::string encoding = "BitVector";

  switch (var->bytes_per_bit) {
    case FSDB_BYTES_PER_BIT_1B:
      //   bpb = (str_T) "1B";
      break;

    case FSDB_BYTES_PER_BIT_2B:
      //   bpb = (str_T) "2B";
      break;

    case FSDB_BYTES_PER_BIT_4B:
      //   bpb = (str_T) "4B";
      break;

    case FSDB_BYTES_PER_BIT_8B:
      //   bpb = (str_T) "8B";
      break;

    default:
      //   bpb = (str_T) "?B";
      break;
  }

  switch (var->type) {
    case FSDB_VT_VCD_EVENT:
      type = (str_T) "event";
      break;

    case FSDB_VT_VCD_INTEGER:
      type = (str_T) "integer";
      break;

    case FSDB_VT_VCD_PARAMETER:
      type = (str_T) "parameter";
      encoding = "Real";
      break;

    case FSDB_VT_VCD_REAL:
      type = (str_T) "real";
      encoding = "Real";
      break;

    case FSDB_VT_VCD_REG:
      type = (str_T) "reg";
      break;

    case FSDB_VT_VCD_SUPPLY0:
      type = (str_T) "supply0";
      break;

    case FSDB_VT_VCD_SUPPLY1:
      type = (str_T) "supply1";
      break;

    case FSDB_VT_VCD_TIME:
      type = (str_T) "time";
      encoding = "Real";
      break;

    case FSDB_VT_VCD_TRI:
      type = (str_T) "tri";
      break;

    case FSDB_VT_VCD_TRIAND:
      type = (str_T) "triand";
      break;

    case FSDB_VT_VCD_TRIOR:
      type = (str_T) "trior";
      break;

    case FSDB_VT_VCD_TRIREG:
      type = (str_T) "trireg";
      break;

    case FSDB_VT_VCD_TRI0:
      type = (str_T) "tri0";
      break;

    case FSDB_VT_VCD_TRI1:
      type = (str_T) "tri1";
      break;

    case FSDB_VT_VCD_WAND:
      type = (str_T) "wand";
      break;

    case FSDB_VT_VCD_WIRE:
      type = (str_T) "wire";
      break;

    case FSDB_VT_VCD_WOR:
      type = (str_T) "wor";
      break;

    case FSDB_VT_VHDL_SIGNAL:
      type = (str_T) "signal";
      break;

    case FSDB_VT_VHDL_VARIABLE:
      type = (str_T) "variable";
      break;

    case FSDB_VT_VHDL_CONSTANT:
      type = (str_T) "constant";
      break;

    case FSDB_VT_VHDL_FILE:
      type = (str_T) "file";
      break;

    case FSDB_VT_VCD_MEMORY:
      type = (str_T) "vcd_memory";
      break;

    case FSDB_VT_VHDL_MEMORY:
      type = (str_T) "vhdl_memory";
      break;

    case FSDB_VT_VCD_MEMORY_DEPTH:
      type = (str_T) "vcd_memory_depth_or_range";
      break;

    case FSDB_VT_VHDL_MEMORY_DEPTH:
      type = (str_T) "vhdl_memory_depth";
      break;

    default:
      type = (str_T) "unknown_var_type";
      break;
  }

  // fprintf(stderr, "<Var>  name:%s  l:%u  r:%u  type:%s  ", var->name,
  // var->lbitnum, var->rbitnum, type);

  // fprintf(stderr, "idcode:%llu dtidcode:%u bpb:%s\n", var->u.idcode,
  // var->dtidcode, bpb);

  std::vector<Napi::Value> args;
  args.push_back(Napi::String::New(env_global, var->name));
  args.push_back(Napi::String::New(env_global, type));
  args.push_back(Napi::String::New(env_global, encoding));
  args.push_back(Napi::String::New(env_global, module_path));
  args.push_back(Napi::Number::New(env_global, netlistId));
  args.push_back(Napi::Number::New(env_global, var->u.idcode));
  args.push_back(Napi::Number::New(
      env_global, abs(var->lbitnum - var->rbitnum) + 1));       // width
  args.push_back(Napi::Number::New(env_global, var->lbitnum));  // msb
  args.push_back(Napi::Number::New(env_global, var->rbitnum));  // lsb
  fsdbVarCallback.Call(args);
  netlistId++;
}

void __DumpArray(fsdbTreeCBDataArrayBegin *array) {
  uint_T size = array->size;
  str_T name = array->name;
  // fprintf(stderr, "<BeginArray> name:%s size:%u\n", name, size);
  arraysize_stack.push(size);

  std::vector<Napi::Value> args;
  args.push_back(Napi::String::New(env_global, name));
  args.push_back(Napi::String::New(env_global, module_path));
  args.push_back(Napi::Number::New(env_global, netlistId));
  fsdbArrayBeginCallback.Call(args);
  netlistId++;
}

void __EndArray() {
  // fprintf(stderr, "<EndArray>\n\n");
  if (arraysize_stack.empty()) {
    Napi::TypeError::New(env_global, "stack empty")
        .ThrowAsJavaScriptException();
    return;
  }
  uint_T size = arraysize_stack.top();
  arraysize_stack.pop();
  std::vector<Napi::Value> args;
  args.push_back(Napi::Number::New(env_global, size));
  fsdbArrayEndCallback.Call(args);
}

void loadSignals(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (!CHECK_LENGTH(env, info, 1)) return;
  if (!CHECK_ARRAY(env, info[0])) return;

  Napi::Array signalIdList = info[0].As<Napi::Array>();

  uint32_t len = signalIdList.Length();
  for (uint32_t i = 0; i < len; i++) {
    Napi::Value signalId = signalIdList.Get(i);

    if (signalId.IsNumber()) {
#ifdef FSDB_USE_32B_IDCODE
      fsdbVarIdcode var_idcode = signalId.As<Napi::Number>().Int32Value();
#else
      fsdbVarIdcode var_idcode = signalId.As<Napi::Number>().Int64Value();
#endif
      fsdb_obj->ffrAddToSignalList(var_idcode);
    }
  }
  fsdb_obj->ffrLoadSignals();
  fsdb_obj->ffrResetSignalList();
}

Napi::Object getValueChanges(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  Napi::Object result = Napi::Object::New(env);
  Napi::Array valueChanges = Napi::Array::New(env);
  result.Set("valueChanges", valueChanges);

  if (!CHECK_LENGTH(env, info, 1)) return result;
  if (!CHECK_NUMBER(env, info[0])) return result;

#ifdef FSDB_USE_32B_IDCODE
  fsdbVarIdcode var_idcode = info[0].As<Napi::Number>().Int32Value();
#else
  fsdbVarIdcode var_idcode = info[0].As<Napi::Number>().Int64Value();
#endif

  double _min = 0.0;
  double _max = 0.0;

  fsdbTag64 time;
  ffrVCTrvsHdl vc_trvs_hdl = fsdb_obj->ffrCreateVCTraverseHandle(var_idcode);

  // Check to see if this var has value changes or not.
  if (FALSE == vc_trvs_hdl->ffrHasIncoreVC()) {
    vc_trvs_hdl->ffrFree();
    return result;
  }

  // Jump to the minimum time(xtag).
  vc_trvs_hdl->ffrGetMinXTag((void *)&time);
  vc_trvs_hdl->ffrGotoXTag((void *)&time);
  do {  // TODO(heyfey): fix glitch & delta
    byte_T *vc_ptr;
    vc_trvs_hdl->ffrGetXTag(&time);
    vc_trvs_hdl->ffrGetVC(&vc_ptr);
    __PrintTimeValChng(vc_trvs_hdl, &time, vc_ptr, info, valueChanges, _min,
                       _max);
  } while (FSDB_RC_SUCCESS == vc_trvs_hdl->ffrGotoNextVC());

  Napi::Number min = Napi::Number::New(env, _min);
  result.Set("min", min);
  Napi::Number max = Napi::Number::New(env, _max);
  result.Set("max", max);

  vc_trvs_hdl->ffrFree();

  return result;
}

void unloadSignal(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (!CHECK_LENGTH(env, info, 1)) return;
  if (!CHECK_NUMBER(env, info[0])) return;

#ifdef FSDB_USE_32B_IDCODE
  fsdbVarIdcode var_idcode = info[0].As<Napi::Number>().Int32Value();
#else
  fsdbVarIdcode var_idcode = info[0].As<Napi::Number>().Int64Value();
#endif

  fsdb_obj->ffrUnloadSignals(var_idcode);
}

// Store value changes in result.
static void __PrintTimeValChng(ffrVCTrvsHdl vc_trvs_hdl, fsdbTag64 *time,
                               byte_T *vc_ptr, const Napi::CallbackInfo &info,
                               Napi::Array &result, double &min, double &max) {
  Napi::Env env = info.Env();
  uint32_t len;
  std::string value;
  Napi::Array valueChange;  // array of length 2: [time: Number, value: String]

  float vc_float;
  double vc_double;

  static byte_T buffer[FSDB_MAX_BIT_SIZE + 1];
  //   byte_T *ret_vc; // unused
  uint_T i;
  fsdbVarType var_type;

  switch (vc_trvs_hdl->ffrGetBytesPerBit()) {
    case FSDB_BYTES_PER_BIT_1B:
      //
      // Convert each verilog bit type to corresponding
      // character.
      //
      for (i = 0; i < vc_trvs_hdl->ffrGetBitSize(); i++) {
        switch (vc_ptr[i]) {
          case FSDB_BT_VCD_0:
            buffer[i] = '0';
            break;

          case FSDB_BT_VCD_1:
            buffer[i] = '1';
            break;

          case FSDB_BT_VCD_X:
            buffer[i] = 'x';
            break;

          case FSDB_BT_VCD_Z:
            buffer[i] = 'z';
            break;

          default:
            //
            // unknown verilog bit type found.
            //
            buffer[i] = 'u';
        }
      }
      buffer[i] = '\0';

      // fprintf(stderr, "time: (%u %u)  val chg: %s\n", time->H, time->L,
      // buffer);
      value = std::string(reinterpret_cast<char *>(buffer));
      valueChange = Napi::Array::New(env, 2);
      valueChange.Set((uint32_t)0,
                      Napi::Number::New(env, combineTime(time->H, time->L)));
      valueChange.Set((uint32_t)1, Napi::String::New(env, value));
      len = result.Length();
      result.Set(len, valueChange);
      break;

    case FSDB_BYTES_PER_BIT_4B:
      //
      // Not 0, 1, x, z since their bytes per bit is
      // FSDB_BYTES_PER_BIT_1B.
      //
      // For verilog type fsdb, there is no array of
      // real/float/double so far, so we don't have to
      // care about that kind of case.
      //

      //
      // The var type of memory range variable is
      // FSDB_VT_VCD_MEMORY_DEPTH. This kind of var
      // has two value changes at certain time step.
      // The first value change is the index of the
      // beginning memory variable which has a value change
      // and the second is the index of the end memory variable
      // which has a value change at this time step. The index
      // is stored as an unsigned integer and its bpb is 4B.
      //

      var_type = vc_trvs_hdl->ffrGetVarType();
      switch (var_type) {
        case FSDB_VT_VCD_MEMORY_DEPTH:
        case FSDB_VT_VHDL_MEMORY_DEPTH:
          // fprintf(stderr, "time: (%u %u)", time->H, time->L);
          // fprintf(stderr, "  begin: %d", *((int *)vc_ptr));
          vc_ptr = vc_ptr + sizeof(uint_T);
          // fprintf(stderr, "  end: %d\n", *((int *)vc_ptr));
          break;

        default:
          vc_trvs_hdl->ffrGetVC(&vc_ptr);
          // fprintf(stderr, "time: (%u %u)  val chg: %f\n", time->H, time->L,
          // *((float *)vc_ptr));
          vc_float = *((float *)vc_ptr);
          min = std::min(min, static_cast<double>(vc_float));
          max = std::min(max, static_cast<double>(vc_float));
          valueChange = Napi::Array::New(env, 2);
          valueChange.Set((uint32_t)0, Napi::Number::New(
                                           env, combineTime(time->H, time->L)));
          valueChange.Set((uint32_t)1,
                          Napi::String::New(env, std::to_string(vc_float)));
          len = result.Length();
          result.Set(len, valueChange);
          break;
      }
      break;

    case FSDB_BYTES_PER_BIT_8B:
      //
      // Not 0, 1, x, z since their bytes per bit is
      // FSDB_BYTES_PER_BIT_1B.
      //
      // For verilog type fsdb, there is no array of
      // real/float/double so far, so we don't have to
      // care about that kind of case.
      //
      // fprintf(stderr, "time: (%u %u)  val chg: %e\n", time->H, time->L,
      // *((double *)vc_ptr));
      vc_double = *((double *)vc_ptr);
      min = std::min(min, vc_double);
      max = std::min(max, vc_double);
      valueChange = Napi::Array::New(env, 2);
      valueChange.Set((uint32_t)0,
                      Napi::Number::New(env, combineTime(time->H, time->L)));
      valueChange.Set((uint32_t)1,
                      Napi::String::New(env, std::to_string(vc_double)));
      len = result.Length();
      result.Set(len, valueChange);
      break;

    default:
      // fprintf(stderr, "Control flow should not reach here.\n");
      break;
  }
}

void unload(const Napi::CallbackInfo &info) {
  scope_offset.clear();
  module_path_stack.clear();
  std::stack<uint_T> s;
  arraysize_stack.swap(s);  // clear the stack
  env_global = nullptr;
  netlistId = 0;

  fsdb_obj->ffrResetSignalList();
  fsdb_obj->ffrUnloadSignals();
  fsdb_obj->ffrClose();
  fsdb_obj = nullptr;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set(Napi::String::New(env, "openFsdb"),
              Napi::Function::New(env, openFsdb));
  exports.Set(Napi::String::New(env, "readMetadata"),
              Napi::Function::New(env, readMetadata));
  exports.Set(Napi::String::New(env, "readScopes"),
              Napi::Function::New(env, readScopes));
  exports.Set(Napi::String::New(env, "readVars"),
              Napi::Function::New(env, readVars));
  exports.Set(Napi::String::New(env, "loadSignals"),
              Napi::Function::New(env, loadSignals));
  exports.Set(Napi::String::New(env, "unloadSignal"),
              Napi::Function::New(env, unloadSignal));
  exports.Set(Napi::String::New(env, "getValueChanges"),
              Napi::Function::New(env, getValueChanges));
  exports.Set(Napi::String::New(env, "unload"),
              Napi::Function::New(env, unload));
  return exports;
}

NODE_API_MODULE(fsdb_reader, Init)
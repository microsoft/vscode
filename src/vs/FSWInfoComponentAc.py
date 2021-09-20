// ======================================================================
// \title  FSWInfoImpl.hpp
// \author vwong
// \brief  hpp file for FSWInfo component implementation class
//
// \copyright
// Copyright 2009-2015, by the California Institute of Technology.
// ALL RIGHTS RESERVED.  United States Government Sponsorship
// acknowledged.
// ======================================================================

#ifndef FSWInfo_HPP
#define FSWInfo_HPP

#include "App/FSWInfo/FSWInfoComponentAc.hpp"

// generated and linked at build time
extern const char* FSW_VERSION;


namespace App {

  class FSWInfoComponentImpl :
    public FSWInfoComponentBase
  {

    public:

      // ----------------------------------------------------------------------
      // Construction, initialization, and destruction
      // ----------------------------------------------------------------------

      //! Construct object FSWInfo
      //!
      FSWInfoComponentImpl(
#if FW_OBJECT_NAMES == 1
          const char *const compName //!< The component name
#endif
      );

      //! Initialize object FSWInfo
      //!
      void init(
          const NATIVE_INT_TYPE queueDepth, //!< The queue depth
          const NATIVE_INT_TYPE instance = 0 //!< The instance number
      );

      //! Destroy object FSWInfo
      //!
      ~FSWInfoComponentImpl(void);

      //! Actions to take on component start
      //!
      void preamble(void);

    PRIVATE:

      // ----------------------------------------------------------------------
      // Handler implementations for user-defined typed input ports
      // ----------------------------------------------------------------------

      //! Handler implementation for PingRecv
      //!
      void PingRecv_handler(
          const NATIVE_INT_TYPE portNum, //!< The port number
          U32 key //!< Value to return to pinger
      );


      //! Handler implementation for reportFSWInfo
      //!
      void reportFSWInfo_handler(
          const NATIVE_INT_TYPE portNum //!< The port number
      );

      //! Handler implementation for schedIn
      //!
      void schedIn_handler(
          const NATIVE_INT_TYPE portNum, //!< The port number
          NATIVE_UINT_TYPE context //!< The call order
      );

    PRIVATE:

      // ----------------------------------------------------------------------
      // Command handler implementations
      // ----------------------------------------------------------------------

      //! Implementation for FSWINFO_DMP command handler
      //! Generate FSW version EVR and SRAM boot count EHA
      void FSWINFO_DMP_cmdHandler(
          const FwOpcodeType opCode, //!< The opcode
          const U32 cmdSeq //!< The command sequence number
      );

      //! Implementation for FSWINFO_RESET_FSW command handler
      //! Perform a soft reset of flight software
      void FSWINFO_RESET_FSW_cmdHandler(
          const FwOpcodeType opCode, //!< The opcode
          const U32 cmdSeq //!< The command sequence number
      );

      //! Implementation for FSWINFO_INIT_SRAM_VALS command handler
      //! Activates SRAM flag
      void FSWINFO_INIT_SRAM_VALS_cmdHandler(
          const FwOpcodeType opCode, //!< The opcode
          const U32 cmdSeq //!< The command sequence number
      );

      //! Implementation for FSWINFO_TIME_UPDT_ABS command handler
      //! Update SCLK value with absolute time second and sub-second values
      void FSWINFO_TIME_UPDT_ABS_cmdHandler(
          const FwOpcodeType opCode, /*!< The opcode*/
          const U32 cmdSeq, /*!< The command sequence number*/
          U32 secs, /*!<  Whole seconds value to use when updating time */
          U32 usecs /*!<  Sub-seconds value to use when updating time */
      );

      //! Implementation for FSWINFO_TIME_UPDT_REL command handler
      //! Increment current SCLK value with relative time second and sub-second values
      void FSWINFO_TIME_UPDT_REL_cmdHandler(
          const FwOpcodeType opCode, /*!< The opcode*/
          const U32 cmdSeq, /*!< The command sequence number*/
          U32 secs, /*!<  Whole seconds value to use when updating time */
          U32 usecs /*!<  Sub-seconds value to use when updating time */
      );

      //! Implementation for FSWINFO_FPGA_WDOG_TIME_LEFT_DMP command handler
      //! Dump value of Sphinx FPGA watchdog time left register
      void FSWINFO_FPGA_WDOG_TIME_LEFT_DMP_cmdHandler(
          const FwOpcodeType opCode, /*!< The opcode*/
          const U32 cmdSeq /*!< The command sequence number*/
      );

      //! Implementation for FSWINFO_READ_REG command handler
      //! Read contents of a 4-byte register and output value to an event. The address must be 4-byte aligned. NOTE: This command must be used with caution to specify a valid 4-byte address to read from. Attempting to read from an invalid address may result in a trap exception or software crash leading to a soft reset or Sphinx watchdog timer expiration.
      void FSWINFO_READ_REG_cmdHandler(
          const FwOpcodeType opCode, /*!< The opcode*/
          const U32 cmdSeq, /*!< The command sequence number*/
          U32 address, /*!< 4-byte aligned memory location address to read from*/
          U8 lock, /*!< Lock value for command*/
          U8 key /*!< Key value for command, must be complement of lock value for command to execute.*/
      );

      //! Implementation for FSWINFO_WRITE_REG command handler
      //! Write a 4-byte value to a location in memory. The address must be 4-byte aligned. NOTE: This command must be used with caution to specify a valid 4-byte address to be written. Attempting to write to an invalid address may result in a trap exception or software crash leading to a soft reset or Sphinx watchdog timer expiration. Also, writing to a memory location using this command may result in a possible race condition.
      void FSWINFO_WRITE_REG_cmdHandler(
          const FwOpcodeType opCode, /*!< The opcode*/
          const U32 cmdSeq, /*!< The command sequence number*/
          U32 address, /*!< 4-byte aligned memory location address to be written*/
          U32 value, /*!< Value to be written at specified memory location*/
          U8 lock, /*!< Lock value for command*/
          U8 key /*!< Key value for command, must be complement of lock value for command to execute.*/
      );

    PRIVATE: //methods

      void reportFSWInfo(void);
      void initSRAM(void);
      void resetSRAMPartitionFlags(void);

      const static U32 SPHINX_SOFT_RESET_REG = 0x200D0004;
      const static U32 SPHINX_SOFT_RESET_VAL = 0x424EA480;

      const static U32 SPHINX_FW_VERSION_REG = 0x20000000;

      const static U32 SPHINX_FPGA_WDOG_TIME_LEFT_REG = 0x200D0018;
    };

} // end namespace App

#endif

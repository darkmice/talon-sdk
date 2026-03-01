//go:build linux && arm64

package talon

/*
#cgo LDFLAGS: -L${SRCDIR}/lib/linux_arm64 -ltalon
#cgo LDFLAGS: -lm -ldl -lpthread
*/
import "C"
